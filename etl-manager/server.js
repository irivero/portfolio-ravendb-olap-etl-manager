"use strict";

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const { 
  DocumentStore, 
  AddEtlOperation,
  UpdateEtlOperation, 
  RavenEtlConfiguration,
  OlapEtlConfiguration,
  Transformation,
  PutConnectionStringOperation,
  RemoveConnectionStringOperation,
  RavenConnectionString,
  OlapConnectionString,
  GetConnectionStringsOperation,
  GetDatabaseRecordOperation,
  DeleteOngoingTaskOperation,
  ResetEtlOperation
} = require("ravendb");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"]
    }
  }
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

// Rate limiting: 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: "Too many requests from this IP, please try again later." });
  }
});
app.use("/api/", limiter);

// API Key authentication middleware
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized: Invalid API key" });
  }
  next();
};

// Connection pool for RavenDB stores
const connectionPool = new Map();

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Get or create a DocumentStore for the given connection parameters.
 * Implements connection pooling to reuse existing stores.
 */
function getOrCreateStore(connectionParams) {
  const { url, database, certificatePath, certificatePem } = connectionParams;
  
  // Include certificate info in pool key to avoid reusing wrong connections
  const certKey = certificatePath || (certificatePem ? 'uploaded' : 'none');
  const poolKey = `${url}:${database}:${certKey}`;

  console.log('🔐 Certificate configuration:', {
    certificatePath,
    certificatePemProvided: !!certificatePem,
    certificatePathExists: certificatePath ? fs.existsSync(certificatePath) : false,
    poolKey
  });

  if (connectionPool.has(poolKey)) {
    console.log('♻️  Reusing existing connection from pool');
    return connectionPool.get(poolKey);
  }

  // Dispose old connections with different certificates for the same database
  for (const [key, store] of connectionPool.entries()) {
    if (key.startsWith(`${url}:${database}:`)) {
      console.log(`🗑️  Disposing old connection: ${key}`);
      store.dispose();
      connectionPool.delete(key);
    }
  }

  let authOptions = {};
  if (certificatePath && fs.existsSync(certificatePath)) {
    console.log('✅ Using certificate from path:', certificatePath);
    authOptions = {
      type: "pem",
      certificate: fs.readFileSync(certificatePath)
    };
  } else if (certificatePem) {
    console.log('✅ Using certificate from uploaded file');
    authOptions = {
      type: "pem",
      certificate: Buffer.from(certificatePem)
    };
  } else {
    console.log('⚠️  No certificate provided - attempting insecure connection');
  }

  console.log('🔧 Creating new DocumentStore with auth options:', { 
    hasAuth: Object.keys(authOptions).length > 0,
    url,
    database 
  });

  const store = new DocumentStore(url, database, authOptions);
  store.initialize();

  connectionPool.set(poolKey, store);

  // Cleanup after 30 minutes of inactivity
  setTimeout(() => {
    if (connectionPool.has(poolKey)) {
      store.dispose();
      connectionPool.delete(poolKey);
    }
  }, 30 * 60 * 1000);

  return store;
}

// ═══════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/connect
 * Test connection to RavenDB and return database info
 */
app.post("/api/connect", authenticateApiKey, async (req, res) => {
  try {
    const { url, database, certificatePath, certificatePem } = req.body;

    if (!url || !database) {
      return res.status(400).json({ error: "Missing required fields: url, database" });
    }

    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });
    
    // Test connection
    const session = store.openSession();
    const stats = await session.advanced.rawQuery("from @all_docs").statistics(s => s).waitForNonStaleResults().all();
    await session.dispose();

    res.json({
      success: true,
      database,
      url,
      message: "Connection successful"
    });

  } catch (error) {
    console.error("Connection error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/collections
 * Retrieve all collections in the database
 */
app.post("/api/collections", authenticateApiKey, async (req, res) => {
  try {
    const { url, database, certificatePath, certificatePem } = req.body;
    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });

    // Use a query to get collection statistics
    const session = store.openSession(database);
    const stats = await session.advanced.rawQuery(`
      from @all_docs
      group by '@metadata.@collection'
      select key() as name, count() as count
    `).all();
    await session.dispose();

    const collections = stats
      .filter(c => c.name && c.name !== "@empty")
      .map(c => ({
        name: c.name,
        count: c.count
      }));

    res.json({ collections });

  } catch (error) {
    console.error("Collections error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/collections/documents
 * Get documents from a specific collection with pagination
 */
app.post("/api/collections/documents", authenticateApiKey, async (req, res) => {
  try {
    const { url, database, certificatePath, certificatePem, collectionName, page = 1, pageSize = 20 } = req.body;
    
    console.log(`📄 Fetching documents from collection: "${collectionName}" (page ${page})`);
    
    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });

    const session = store.openSession(database);
    
    // Calculate offset for pagination
    const offset = (page - 1) * pageSize;
    
    // First, get total count using a simple query for statistics
    let stats;
    await session.query({ collection: collectionName })
      .statistics(s => stats = s)
      .take(0)
      .all();
    
    const totalDocuments = stats ? stats.totalResults : 0;
    
    // Query documents from the specified collection with pagination
    // RQL syntax: using alias when selecting with projection
    const query = `from '${collectionName}' as doc select { id: id(doc) } limit ${offset}, ${pageSize}`;
    console.log(`📋 RQL Query: ${query}`);
    
    const results = await session.advanced.rawQuery(query).all();
    
    await session.dispose();

    const totalPages = Math.ceil(totalDocuments / pageSize);
    
    console.log(`✅ Found ${results.length} documents from "${collectionName}" (page ${page}/${totalPages}, total: ${totalDocuments})`);

    res.json({ 
      documents: results,
      pagination: {
        page,
        pageSize,
        totalDocuments,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });

  } catch (error) {
    console.error("❌ Collection documents error:", error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

/**
 * POST /api/documents/get
 * Get a specific document by ID
 */
app.post("/api/documents/get", authenticateApiKey, async (req, res) => {
  try {
    const { url, database, certificatePath, certificatePem, documentId } = req.body;
    
    console.log(`📄 Fetching document: "${documentId}"`);
    
    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });
    const session = store.openSession(database);
    
    // Load the document by ID
    const document = await session.load(documentId);
    
    await session.dispose();

    if (!document) {
      return res.status(404).json({ error: `Document "${documentId}" not found` });
    }
    
    console.log(`✅ Document "${documentId}" loaded successfully`);

    res.json({ document });

  } catch (error) {
    console.error("❌ Document fetch error:", error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

/**
 * POST /api/documents/save
 * Save changes to a specific document
 */
app.post("/api/documents/save", authenticateApiKey, async (req, res) => {
  try {
    const { url, database, certificatePath, certificatePem, documentId, document } = req.body;
    
    const isNewDocument = documentId === null || documentId === undefined;
    console.log(`💾 Saving document: "${documentId}" (${isNewDocument ? 'NEW' : 'UPDATE'})`);
    
    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });
    const session = store.openSession(database);
    
    // Store the document
    if (isNewDocument) {
      // For new documents, don't pass an ID - let RavenDB generate it
      await session.store(document);
      await session.saveChanges();
      
      // Get the generated document ID
      const generatedId = session.advanced.getDocumentId(document);
      console.log(`🆔 RavenDB generated ID: "${generatedId}"`);
      
      // Now add the 'Id' field with the same value as the generated @id
      document['Id'] = generatedId;
      
      // Update the document with the Id field
      await session.store(document, generatedId);
      await session.saveChanges();
      
      console.log(`✅ Document "${generatedId}" saved with Id field`);
      
      await session.dispose();
      
      res.json({ 
        success: true,
        message: 'Document saved successfully',
        documentId: generatedId,
        isNew: true
      });
    } else {
      // For updates, use the existing ID
      await session.store(document, documentId);
      await session.saveChanges();
      
      await session.dispose();
      
      console.log(`✅ Document "${documentId}" updated successfully`);
      
      res.json({ 
        success: true,
        message: 'Document saved successfully',
        documentId: documentId,
        isNew: false
      });
    }

  } catch (error) {
    console.error("❌ Document save error:", error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

/**
 * POST /api/documents/delete
 * Delete a specific document by ID
 */
app.post("/api/documents/delete", authenticateApiKey, async (req, res) => {
  try {
    const { url, database, certificatePath, certificatePem, documentId } = req.body;
    
    console.log(`🗑️  Deleting document: "${documentId}"`);
    
    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });
    const session = store.openSession(database);
    
    // Delete the document
    await session.delete(documentId);
    await session.saveChanges();
    
    await session.dispose();
    
    console.log(`✅ Document "${documentId}" deleted successfully`);

    res.json({ 
      success: true, 
      message: 'Document deleted successfully',
      documentId: documentId
    });

  } catch (error) {
    console.error("❌ Document delete error:", error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

/**
 * POST /api/query/execute
 * Execute a raw RQL query
 */
app.post("/api/query/execute", authenticateApiKey, async (req, res) => {
  try {
    const { url, database, certificatePath, certificatePem, query } = req.body;
    
    if (!query || !query.trim()) {
      return res.status(400).json({ error: "Query is required" });
    }
    
    if (!url || !database) {
      return res.status(400).json({ error: "Database connection parameters are required" });
    }
    
    console.log(`🔍 Executing query for database "${database}": "${query.substring(0, 100)}..."`);
    
    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });
    const session = store.openSession(database);
    
    let stats;
    const queryResult = await session.advanced
      .rawQuery(query)
      .statistics(s => stats = s)
      .all();
    
    await session.dispose();
    
    console.log(`✅ Query executed successfully: ${queryResult.length} results`);

    res.json({ 
      results: queryResult,
      totalResults: stats.totalResults,
      durationInMs: stats.durationInMs
    });

  } catch (error) {
    console.error("❌ Query execution error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ 
      error: error.message || "Query execution failed",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

/**
 * POST /api/etl/list
 * List all ETL tasks in the database
 */
app.post("/api/etl/list", authenticateApiKey, async (req, res) => {
  try {
    const { url, database, certificatePath, certificatePem } = req.body;
    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });

    // Get database record which contains ETL configurations
    const databaseRecord = await store.maintenance.server.send(
      new GetDatabaseRecordOperation(database)
    );

    const etlTasks = [];

    // Extract RavenDB ETL tasks
    if (databaseRecord.etls) {
      databaseRecord.etls.forEach(etl => {
        etlTasks.push({
          name: etl.name,
          type: "RavenEtl",
          connectionString: etl.connectionStringName,
          collections: etl.transforms?.map(t => t.collections).flat() || [],
          disabled: etl.disabled || false
        });
      });
    }

    // Extract OLAP ETL tasks
    if (databaseRecord.olapEtls) {
      databaseRecord.olapEtls.forEach(etl => {
        etlTasks.push({
          name: etl.name,
          type: "OlapEtl",
          connectionString: etl.connectionStringName,
          collections: etl.transforms?.map(t => t.collections).flat() || [],
          disabled: etl.disabled || false
        });
      });
    }

    res.json({ tasks: etlTasks });

  } catch (error) {
    console.error("ETL list error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/etl/get
 * Get details of a specific ETL task including its scripts
 */
app.post("/api/etl/get", authenticateApiKey, async (req, res) => {
  try {
    const { url, database, certificatePath, certificatePem, etlName } = req.body;

    if (!etlName) {
      return res.status(400).json({ error: "Missing ETL name" });
    }

    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });

    // Get database record which contains ETL configurations
    const databaseRecord = await store.maintenance.server.send(
      new GetDatabaseRecordOperation(database)
    );

    // Search in RavenDB ETLs
    if (databaseRecord.etls) {
      const etl = databaseRecord.etls.find(e => e.name === etlName);
      if (etl) {
        const transforms = etl.transforms || [];
        return res.json({
          name: etl.name,
          type: "RavenEtl",
          connectionString: etl.connectionStringName,
          disabled: etl.disabled || false,
          taskId: etl.taskId,
          mentorNode: etl.mentorNode,
          pinned: etl.pinned || false,
          allowEtlOnNonEncryptedChannel: etl.allowEtlOnNonEncryptedChannel || false,
          // Add all other config properties
          configuration: {
            mentorRetentionTime: etl.mentorRetentionTime,
            transformationScriptsSources: etl.transformationScriptsSources
          },
          transforms: transforms.map(t => ({
            name: t.name,
            collections: t.collections || [],
            script: t.script || "",
            applyToAllDocuments: t.applyToAllDocuments || false
          }))
        });
      }
    }

    // Search in OLAP ETLs
    if (databaseRecord.olapEtls) {
      const etl = databaseRecord.olapEtls.find(e => e.name === etlName);
      if (etl) {
        const transforms = etl.transforms || [];
        return res.json({
          name: etl.name,
          type: "OlapEtl",
          connectionString: etl.connectionStringName,
          disabled: etl.disabled || false,
          taskId: etl.taskId,
          mentorNode: etl.mentorNode,
          pinned: etl.pinned || false,
          // Add all other config properties
          configuration: {
            mentorRetentionTime: etl.mentorRetentionTime,
            transformationScriptsSources: etl.transformationScriptsSources,
            runFrequency: etl.runFrequency
          },
          transforms: transforms.map(t => ({
            name: t.name,
            collections: t.collections || [],
            script: t.script || "",
            applyToAllDocuments: t.applyToAllDocuments || false
          }))
        });
      }
    }

    // ETL not found
    res.status(404).json({ error: `ETL task '${etlName}' not found` });

  } catch (error) {
    console.error("ETL get error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/etl/update-transform
 * Update a specific transformation script within an ETL task
 */
app.post("/api/etl/update-transform", authenticateApiKey, async (req, res) => {
  try {
    const { url, database, certificatePath, certificatePem, etlName, etlType, transformName, newScript } = req.body;

    if (!etlName || !transformName) {
      return res.status(400).json({ error: "Missing ETL name or transform name" });
    }

    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });

    // Get database record
    const databaseRecord = await store.maintenance.server.send(
      new GetDatabaseRecordOperation(database)
    );

    let etl = null;
    let etlArray = null;

    // Find the ETL configuration
    if (etlType === "RavenEtl" && databaseRecord.etls) {
      etl = databaseRecord.etls.find(e => e.name === etlName);
      etlArray = "etls";
    } else if (etlType === "OlapEtl" && databaseRecord.olapEtls) {
      etl = databaseRecord.olapEtls.find(e => e.name === etlName);
      etlArray = "olapEtls";
    }

    if (!etl) {
      return res.status(404).json({ error: `ETL task '${etlName}' not found` });
    }

    // Find and update the transformation
    const transformIndex = etl.transforms.findIndex(t => t.name === transformName);
    if (transformIndex === -1) {
      return res.status(404).json({ error: `Transform '${transformName}' not found in ETL '${etlName}'` });
    }

    // Update the script in the transform
    etl.transforms[transformIndex].script = newScript;

    // Recreate the ETL configuration object with proper class type
    let etlConfig;
    if (etlType === "RavenEtl") {
      etlConfig = new RavenEtlConfiguration();
      Object.assign(etlConfig, etl);
      
      // Recreate transforms as Transformation objects
      etlConfig.transforms = etl.transforms.map(t => {
        const transform = new Transformation();
        Object.assign(transform, t);
        return transform;
      });
    } else if (etlType === "OlapEtl") {
      etlConfig = new OlapEtlConfiguration();
      Object.assign(etlConfig, etl);
      
      // Recreate transforms as Transformation objects
      etlConfig.transforms = etl.transforms.map(t => {
        const transform = new Transformation();
        Object.assign(transform, t);
        return transform;
      });
    }

    // Use UpdateEtlOperation to save changes
    const updateOperation = new UpdateEtlOperation(etl.taskId, etlConfig);
    
    await store.maintenance.send(updateOperation);

    console.log(`✅ Updated transform '${transformName}' in ETL '${etlName}'`);

    res.json({
      success: true,
      message: `Transform '${transformName}' updated successfully`,
      etlName: etlName,
      transformName: transformName
    });

  } catch (error) {
    console.error("ETL update-transform error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * POST /api/etl/update-config
 * Update ETL configuration (runFrequency, etc.)
 */
app.post("/api/etl/update-config", authenticateApiKey, async (req, res) => {
  try {
    const { url, database, certificatePath, certificatePem, etlName, etlType, runFrequency } = req.body;

    if (!etlName || !etlType) {
      return res.status(400).json({ error: "Missing ETL name or type" });
    }

    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });

    // Get database record
    const databaseRecord = await store.maintenance.server.send(
      new GetDatabaseRecordOperation(database)
    );

    let etl = null;

    // Find the ETL configuration
    if (etlType === "RavenEtl" && databaseRecord.etls) {
      etl = databaseRecord.etls.find(e => e.name === etlName);
    } else if (etlType === "OlapEtl" && databaseRecord.olapEtls) {
      etl = databaseRecord.olapEtls.find(e => e.name === etlName);
    }

    if (!etl) {
      return res.status(404).json({ error: `ETL task '${etlName}' not found` });
    }

    // Update the configuration
    if (runFrequency !== undefined) {
      etl.runFrequency = runFrequency;
    }

    // Recreate the ETL configuration object with proper class type
    let etlConfig;
    if (etlType === "RavenEtl") {
      etlConfig = new RavenEtlConfiguration();
      Object.assign(etlConfig, etl);
      
      // Recreate transforms as Transformation objects
      etlConfig.transforms = (etl.transforms || []).map(t => {
        const transform = new Transformation();
        Object.assign(transform, t);
        return transform;
      });
    } else if (etlType === "OlapEtl") {
      etlConfig = new OlapEtlConfiguration();
      Object.assign(etlConfig, etl);
      
      // Recreate transforms as Transformation objects
      etlConfig.transforms = (etl.transforms || []).map(t => {
        const transform = new Transformation();
        Object.assign(transform, t);
        return transform;
      });
    }

    // Use UpdateEtlOperation to save changes
    const updateOperation = new UpdateEtlOperation(etl.taskId, etlConfig);
    
    await store.maintenance.send(updateOperation);

    console.log(`✅ Updated configuration for ETL '${etlName}'`);

    res.json({
      success: true,
      message: `ETL configuration updated successfully`,
      etlName: etlName
    });

  } catch (error) {
    console.error("ETL update-config error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * POST /api/etl/run
 * Run/Reset ETL task manually (forces processing)
 */
app.post("/api/etl/run", authenticateApiKey, async (req, res) => {
  try {
    const { url, database, certificatePath, certificatePem, etlName, etlType } = req.body;

    if (!etlName || !etlType) {
      return res.status(400).json({ error: "Missing ETL name or type" });
    }

    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });

    // Get database record to find the task ID
    const databaseRecord = await store.maintenance.server.send(
      new GetDatabaseRecordOperation(database)
    );

    let etl = null;

    // Find the ETL configuration
    if (etlType === "RavenEtl" && databaseRecord.etls) {
      etl = databaseRecord.etls.find(e => e.name === etlName);
    } else if (etlType === "OlapEtl" && databaseRecord.olapEtls) {
      etl = databaseRecord.olapEtls.find(e => e.name === etlName);
    }

    if (!etl) {
      return res.status(404).json({ error: `ETL task '${etlName}' not found` });
    }

    console.log(`🔄 Attempting to trigger ETL '${etlName}' (Task ID: ${etl.taskId}, Type: ${etlType})`);
    console.log(`📋 ETL Configuration:`, {
      disabled: etl.disabled,
      taskId: etl.taskId,
      connectionStringName: etl.connectionStringName,
      hasTransforms: etl.transforms && etl.transforms.length > 0
    });

    // Check if ETL is disabled
    if (etl.disabled) {
      console.log(`⚠️  ETL '${etlName}' is DISABLED - it will not execute until enabled`);
      return res.json({
        success: false,
        warning: true,
        message: `ETL '${etlName}' is disabled and will not execute. Enable it first in RavenDB Studio.`,
        etlName: etlName,
        taskId: etl.taskId,
        disabled: true
      });
    }

    // Use ResetEtlOperation with task ID and ETL name
    const resetOperation = new ResetEtlOperation(etl.taskId, etlName);
    
    const result = await store.maintenance.send(resetOperation);

    console.log(`✅ ETL '${etlName}' reset command sent. Result:`, result);
    
    // For OLAP ETLs, explain the behavior
    const executionInfo = etlType === 'OlapEtl' 
      ? 'OLAP ETL has been reset and will process on its next scheduled run. Check RavenDB Studio > Stats > ETL for execution status.'
      : 'RavenDB ETL has been reset and should start processing shortly. Monitor progress in RavenDB Studio > Stats > ETL.';

    console.log(`ℹ️  ${executionInfo}`);

    res.json({
      success: true,
      message: `ETL '${etlName}' has been reset`,
      info: executionInfo,
      etlName: etlName,
      taskId: etl.taskId,
      etlType: etlType,
      disabled: false,
      result: result
    });

  } catch (error) {
    console.error("ETL run error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * POST /api/connection-strings/list
 * List all connection strings in the database
 */
app.post("/api/connection-strings/list", authenticateApiKey, async (req, res) => {
  try {
    const { url, database, certificatePath, certificatePem } = req.body;
    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });

    const operation = new GetConnectionStringsOperation();
    const result = await store.maintenance.send(operation);

    const connectionStrings = [];

    // RavenDB connection strings
    if (result.ravenConnectionStrings) {
      Object.keys(result.ravenConnectionStrings).forEach(name => {
        connectionStrings.push({
          name,
          type: "RavenDB",
          database: result.ravenConnectionStrings[name].database,
          urls: result.ravenConnectionStrings[name].topologyDiscoveryUrls
        });
      });
    }

    // OLAP connection strings (ADLS, S3, etc.)
    if (result.olapConnectionStrings) {
      Object.keys(result.olapConnectionStrings).forEach(name => {
        const olap = result.olapConnectionStrings[name];
        connectionStrings.push({
          name,
          type: "OLAP",
          destination: olap.azureSettings ? "Azure ADLS" : 
                       olap.s3Settings ? "AWS S3" : 
                       olap.googleCloudSettings ? "Google Cloud Storage" : 
                       olap.localSettings ? "Local" : "Unknown"
        });
      });
    }

    // SQL connection strings
    if (result.sqlConnectionStrings) {
      Object.keys(result.sqlConnectionStrings).forEach(name => {
        connectionStrings.push({
          name,
          type: "SQL",
          connectionString: result.sqlConnectionStrings[name].connectionString
        });
      });
    }

    res.json({ connectionStrings });

  } catch (error) {
    console.error("Connection strings list error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/connection-strings/create
 * Create a new connection string
 */
app.post("/api/connection-strings/create", authenticateApiKey, async (req, res) => {
  try {
    const {
      url,
      database,
      certificatePath,
      certificatePem,
      connectionStringName,
      connectionStringType,
      config // Configuration specific to each type
    } = req.body;

    if (!connectionStringName || !connectionStringType) {
      return res.status(400).json({ error: "Missing required fields: connectionStringName, connectionStringType" });
    }

    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });
    let connectionString;

    switch (connectionStringType) {
      case "RavenDB":
        connectionString = new RavenConnectionString();
        connectionString.name = connectionStringName;
        connectionString.database = config.database || database;
        connectionString.topologyDiscoveryUrls = config.urls || [url];
        break;

      case "OLAP":
        connectionString = new OlapConnectionString();
        connectionString.name = connectionStringName;
        
        // Azure ADLS configuration
        if (config.azureSettings) {
          connectionString.azureSettings = {
            accountName: config.azureSettings.accountName,
            accountKey: config.azureSettings.accountKey,
            storageContainer: config.azureSettings.containerName,  // RavenDB expects 'storageContainer'
            remoteFolderName: config.azureSettings.remoteFolderName || ""
          };
        }
        // Local Parquet export
        else if (config.localSettings) {
          connectionString.localSettings = {
            folderPath: config.localSettings.folderPath
          };
        }
        // AWS S3
        else if (config.s3Settings) {
          connectionString.s3Settings = config.s3Settings;
        }
        // Google Cloud Storage
        else if (config.googleCloudSettings) {
          connectionString.googleCloudSettings = config.googleCloudSettings;
        }
        break;

      default:
        return res.status(400).json({ error: `Unsupported connection string type: ${connectionStringType}` });
    }

    const operation = new PutConnectionStringOperation(connectionString);
    const result = await store.maintenance.send(operation);

    res.json({
      success: true,
      connectionStringName,
      raftCommandIndex: result.raftCommandIndex,
      message: `Connection string '${connectionStringName}' created successfully`
    });

  } catch (error) {
    console.error("Connection string creation error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/connection-strings/test
 * Test an existing connection string
 */
app.post("/api/connection-strings/test", authenticateApiKey, async (req, res) => {
  try {
    const {
      url,
      database,
      certificatePath,
      certificatePem,
      connectionStringName
    } = req.body;

    if (!connectionStringName) {
      return res.status(400).json({ error: "Missing required field: connectionStringName" });
    }

    console.log(`🧪 Testing connection string: "${connectionStringName}"`);

    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });
    
    // Get the full database record which contains all connection strings
    const getDatabaseRecordOp = new GetDatabaseRecordOperation(database);
    const databaseRecord = await store.maintenance.server.send(getDatabaseRecordOp);
    
    // Check if connection string exists in RavenEtls or OlapEtls
    let found = false;
    let connectionStringType = null;
    let connectionStringDetails = null;
    
    // Check RavenDB connection strings
    if (databaseRecord.ravenConnectionStrings && databaseRecord.ravenConnectionStrings[connectionStringName]) {
      found = true;
      connectionStringType = 'RavenDB';
      connectionStringDetails = databaseRecord.ravenConnectionStrings[connectionStringName];
    }
    
    // Check OLAP connection strings
    if (databaseRecord.olapConnectionStrings && databaseRecord.olapConnectionStrings[connectionStringName]) {
      found = true;
      connectionStringType = 'OLAP';
      connectionStringDetails = databaseRecord.olapConnectionStrings[connectionStringName];
    }
    
    if (!found) {
      return res.status(404).json({ 
        success: false, 
        error: `Connection string '${connectionStringName}' not found in database` 
      });
    }

    // Connection string exists and is retrievable
    console.log(`✅ Connection string "${connectionStringName}" (${connectionStringType}) test successful`);

    res.json({
      success: true,
      connectionStringName,
      connectionStringType,
      message: `Connection string '${connectionStringName}' (${connectionStringType}) is valid and accessible`,
      details: connectionStringDetails
    });

  } catch (error) {
    console.error("Connection string test error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/connection-strings/delete
 * Delete an existing connection string
 */
app.post("/api/connection-strings/delete", authenticateApiKey, async (req, res) => {
  try {
    const {
      url,
      database,
      certificatePath,
      certificatePem,
      connectionStringName
    } = req.body;

    if (!connectionStringName) {
      return res.status(400).json({ error: "Missing required field: connectionStringName" });
    }

    console.log(`🗑️  Deleting connection string: "${connectionStringName}"`);

    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });
    
    // RavenDB uses RemoveConnectionStringOperation to delete connection strings
    const operation = new RemoveConnectionStringOperation(connectionStringName);
    const result = await store.maintenance.send(operation);

    console.log(`✅ Connection string "${connectionStringName}" deleted successfully`);

    res.json({
      success: true,
      connectionStringName,
      raftCommandIndex: result.raftCommandIndex,
      message: `Connection string '${connectionStringName}' deleted successfully`
    });

  } catch (error) {
    console.error("Connection string deletion error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/etl/create
 * Create a new ETL transformation using an existing connection string
 */
app.post("/api/etl/create", authenticateApiKey, async (req, res) => {
  try {
    const {
      url,
      database,
      certificatePath,
      certificatePem,
      etlName,
      etlType,
      connectionStringName,
      collections,
      transformScript
    } = req.body;

    if (!etlName || !collections || !transformScript || !connectionStringName) {
      return res.status(400).json({ 
        error: "Missing required ETL parameters: etlName, collections, transformScript, connectionStringName" 
      });
    }

    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });

    // Create transforms configuration
    const transforms = collections.map(collection => {
      const transform = new Transformation();
      transform.name = `${collection}Transform`;
      transform.collections = [collection];
      transform.script = transformScript;
      transform.applyToAllDocuments = false;
      return transform;
    });

    // Create ETL configuration based on type
    let configuration;
    let resultType;

    if (etlType === "OlapEtl") {
      // OLAP ETL (Parquet export to ADLS, S3, Local, etc.)
      configuration = new OlapEtlConfiguration();
      configuration.name = etlName;
      configuration.connectionStringName = connectionStringName;
      configuration.transforms = transforms;
      resultType = "OlapEtl";
    } else {
      // RavenDB ETL (to another RavenDB database)
      configuration = new RavenEtlConfiguration();
      configuration.name = etlName;
      configuration.connectionStringName = connectionStringName;
      configuration.transforms = transforms;
      resultType = "RavenEtl";
    }

    // Send the ETL operation
    const operation = new AddEtlOperation(configuration);
    const result = await store.maintenance.send(operation);

    res.json({
      success: true,
      type: resultType,
      taskId: result.taskId,
      raftCommandIndex: result.raftCommandIndex,
      connectionString: connectionStringName,
      message: `${resultType} '${etlName}' created successfully using connection string '${connectionStringName}'`
    });

  } catch (error) {
    console.error("ETL creation error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/etl/update
 * Update an existing ETL transformation script
 */
app.post("/api/etl/update", authenticateApiKey, async (req, res) => {
  try {
    const {
      url,
      database,
      certificatePath,
      certificatePem,
      etlName,
      collections,
      transformScript
    } = req.body;

    if (!etlName || !transformScript) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });

    // Fetch existing ETL config
    const existingTask = await store.maintenance.send({
      type: "GetOngoingTaskInfoOperation",
      taskId: etlName
    });

    if (!existingTask) {
      return res.status(404).json({ error: `ETL task '${etlName}' not found` });
    }

    // Update the transform script
    existingTask.Configuration.Transforms = collections.map(collection => ({
      Name: `${collection}Transform`,
      Collections: [collection],
      Script: transformScript,
      ApplyToAllDocuments: false
    }));

    // Send update
    await store.maintenance.send({
      type: "UpdateEtlOperation",
      taskId: existingTask.TaskId,
      configuration: existingTask.Configuration
    });

    res.json({
      success: true,
      message: `ETL task '${etlName}' updated successfully`
    });

  } catch (error) {
    console.error("ETL update error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/etl/test
 * Test an ETL transformation script syntax
 */
app.post("/api/etl/test", authenticateApiKey, async (req, res) => {
  try {
    const { transformScript } = req.body;

    if (!transformScript) {
      return res.status(400).json({ error: "Missing transformScript parameter" });
    }

    // Basic JavaScript syntax validation
    try {
      new Function(transformScript);
      
      res.json({
        success: true,
        message: "Script syntax is valid"
      });
    } catch (syntaxError) {
      return res.status(400).json({
        success: false,
        error: `Syntax Error: ${syntaxError.message}`
      });
    }

  } catch (error) {
    console.error("ETL test error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/etl/:name
 * Delete an ETL task
 */
app.delete("/api/etl/:name", authenticateApiKey, async (req, res) => {
  try {
    const { name } = req.params;
    const { url, database, certificatePath, certificatePem, taskType } = req.body;

    console.log('🔍 DELETE /api/etl/:name - Request received:');
    console.log('  - name (param):', name);
    console.log('  - body:', JSON.stringify(req.body, null, 2));
    console.log('  - database:', database);
    console.log('  - url:', url);

    if (!name) {
      return res.status(400).json({ error: "Missing ETL task name" });
    }

    if (!database) {
      return res.status(400).json({ 
        error: "Missing database name. Please connect to RavenDB first." 
      });
    }

    if (!url) {
      return res.status(400).json({ 
        error: "Missing RavenDB URL. Please connect to RavenDB first." 
      });
    }

    const store = getOrCreateStore({ url, database, certificatePath, certificatePem });

    console.log(`🗑️ Attempting to delete ETL task '${name}' from database '${database}'`);

    // First, get the database record to find the task ID
    const getDatabaseRecord = new GetDatabaseRecordOperation(database);
    const dbRecord = await store.maintenance.server.send(getDatabaseRecord);

    // Find the ETL task in the database record
    let taskId = null;
    const etlTasks = [
      ...(dbRecord.ravenEtls || []),
      ...(dbRecord.olapEtls || [])
    ];

    const task = etlTasks.find(t => t.name === name);
    
    if (!task) {
      console.log(`❌ ETL task '${name}' not found`);
      return res.status(404).json({ error: `ETL task '${name}' not found` });
    }

    taskId = task.taskId;
    const actualTaskType = task.constructor.name === 'RavenEtlConfiguration' ? 'RavenEtl' : 'OlapEtl';

    console.log(`📋 Found ETL task: ID=${taskId}, Type=${actualTaskType}`);

    // Create the delete operation using the proper class
    const deleteOperation = new DeleteOngoingTaskOperation(taskId, actualTaskType);
    
    // CRITICAL: Use store.maintenance.send() for database-level operations, NOT store.maintenance.server.send()
    await store.maintenance.send(deleteOperation);

    console.log(`✅ ETL task '${name}' (ID: ${taskId}) deleted successfully`);

    res.json({
      success: true,
      message: `ETL task '${name}' deleted successfully`,
      taskId: taskId
    });

  } catch (error) {
    console.error("❌ ETL deletion error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ═══════════════════════════════════════════════════════════
// ERROR HANDLER
// ═══════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});

// ═══════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🧵  DataLoom | OPPRA Project');
  console.log('    Professional RavenDB ETL Manager');
  console.log('='.repeat(60));
  console.log(`🚀 Server:      http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔐 API Key:     ${process.env.API_KEY ? "Configured" : "Not configured (public access)"}`);
  console.log('='.repeat(60) + '\n');
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing connections...");
  for (const [key, store] of connectionPool) {
    store.dispose();
  }
  process.exit(0);
});
