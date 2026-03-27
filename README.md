<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/176cc1cb-ac78-4f1a-a710-ec22e03c07ee" />  

# DataLoom by IntegrIdia

**Professional RavenDB ETL Manager**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D%2018.0.0-brightgreen.svg)
![RavenDB](https://img.shields.io/badge/RavenDB-6.0+-orange.svg)

DataLoom is a modern, web-based ETL (Extract, Transform, Load) transformation manager designed specifically for RavenDB databases. It provides an intuitive interface for creating, managing, and monitoring data transformations with live code editing powered by Monaco Editor.

## ✨ Features

### ETL Task Management
- **🎨 Live Code Editor**: Monaco Editor integration with syntax highlighting and IntelliSense
- **🔄 CRUD Operations**: Create, read, update, and delete RavenDB and OLAP ETL tasks
- **🔄 Reset ETL State**: Force ETL reprocessing by resetting task state
- **📊 Real-time Status**: Visual indicators showing ETL progress and health
- **✏️ Inline Editing**: Modify transformation scripts and configurations on the fly
- **🎯 Script Testing**: Validate transformation logic before deployment

### Connection String Administration
- **📝 Unified Management**: Create and manage RavenDB and OLAP connection strings
- **🧪 Auto-Test on Creation**: Automatically validates connections after creation
- **🔍 Manual Testing**: Test existing connections with dedicated test button (🧪)
- **⚠️ Smart Alerts**: Visual feedback for success, warnings, and errors
- **🗑️ Safe Deletion**: Remove connection strings with confirmation dialogs

### Database Operations
- **🗄️ Secure Connection**: Certificate-based authentication with RavenDB Cloud
- **📊 Collection Browser**: Visual collection selector with document counts
- **🔗 Connection Pooling**: Efficient resource management and connection reuse
- **🌊 Task Monitoring**: Track all ETL tasks with real-time status updates

### Security & Quality
- **🔐 Optional API Key**: Secure endpoints with configurable authentication
- **🛡️ Rate Limiting**: Built-in protection (100 req/15min)
- **🔒 Certificate Auth**: Support for PEM and PFX client certificates
- **⚡ CSP Headers**: Content Security Policy via Helmet.js

## 🎨 Design

DataLoom features a modern, professional interface with:
- **Color Palette**: Deep blue (#1a1a2e), Primary blue (#3b82f6), Success green (#10b981)
- **Dark Sidebar**: Gradient sidebar with contrasting light content areas
- **Animated Elements**: Pulsating status indicators and smooth transitions
- **Responsive Layout**: Optimized for desktop workflows

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18.0 or higher
- **RavenDB** instance (Cloud or Self-hosted) with admin access
- **Client Certificate** for authentication (`.pem` or `.pfx` format)
- **(Optional)** Azure Data Lake Storage account (for OLAP ETLs)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/irivero/portfolio-ravendb-olap-etl-manager.git
cd dataloom-etl-manager/etl-manager
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment** (optional)
```bash
# Copy example configuration
cp .env.example .env

# Edit configuration
nano .env
```

**Environment Variables**:
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Security (leave empty for development - no auth required)
API_KEY=                          # Optional: Set for production
CORS_ORIGIN=http://localhost:3000 # Allowed CORS origin

# Connection Pool
MAX_CONNECTIONS=10                # Maximum concurrent connections
REQUEST_TIMEOUT=30000             # Request timeout in milliseconds
```

4. **Place certificates** (if using file-based auth)
```bash
mkdir -p certs
cp /path/to/your-certificate.pem certs/
```

5. **Start the server**
```bash
# Development
npm start

# Production
NODE_ENV=production node server.js
```

6. **Open in browser**
```
http://localhost:3000
```

### Quick Start Video

*(Coming soon - Demo walkthrough video)*

## 📖 Usage Guide

### 1. Connect to RavenDB

1. **Enter Connection Details**:
   - RavenDB URL (e.g., `https://your-ravendb-url.ravendb.cloud`)
   - Database name
   
2. **Choose Authentication**:
   - **Certificate File**: Upload `.pfx` or `.pem` certificate
   - **Certificate Content**: Paste PEM certificate text directly
   
3. Click **Connect** - Connection status appears in top right

### 2. Browse Collections

- Click **Collections** tab in sidebar
- View all collections with document counts
- Click any collection to explore documents

### 3. Manage Connection Strings

**Create New Connection String**:
1. Go to **Connection Strings** tab
2. Click **➕ Create Connection String**
3. Select type:
   - **RavenDB**: For database-to-database ETL
   - **OLAP**: For Azure Data Lake Storage export
4. Fill configuration:
   - **RavenDB**: URL, database, certificate
   - **OLAP**: Azure Storage account, key, container, folder
5. Connection automatically tested ✅

**Test Existing Connection**:
- Click 🧪 test button next to any connection string
- Validates accessibility and permissions
- Shows connection string type (RavenDB/OLAP)

**Delete Connection**:
- Click 🗑️ delete button
- Confirm deletion in dialog

### 4. Create ETL Task

#### Option A: RavenDB ETL (Database Replication)
1. Go to **ETL Tasks** tab
2. Click **➕ Create New ETL**
3. Select **RavenDB ETL**
4. Configure:
   ```javascript
   // Transformation script example
   var customer = {
       Id: id(this),
       Name: this.Name,
       Email: this.Email,
       LastModified: new Date().toISOString()
   };
   
   loadToCustomers(customer);
   ```
5. Select destination connection string
6. Click **Create ETL**

#### Option B: OLAP ETL (Export to Parquet)
1. Go to **ETL Tasks** tab
2. Click **➕ Create New ETL**
3. Select **OLAP ETL**
4. Configure transformation for analytics:
   ```javascript
   // Export for data warehouse
   var order = {
       OrderId: id(this),
       CustomerId: this.Customer,
       Total: this.Total,
       OrderDate: this.OrderDate,
       Status: this.Status
   };
   
   loadToOrders(order);
   ```
5. Select OLAP connection string (Azure ADLS)
6. Data exported as Parquet files to Azure

### 5. Manage ETL Tasks

**Edit Transformation**:
- Click task name to open details
- Modify script in Monaco Editor
- Click **💾 Update** to save changes

**Edit Configuration**:
- Adjust ETL settings (schedule, options)
- Update connection string
- Enable/disable task

**Reset ETL State**:
- Click **🔄 Reset ETL State** button
- Confirms action with dialog
- **RavenDB ETL**: Processes modified documents
- **OLAP ETL**: Resets progress, runs on next schedule

> **Important**: For OLAP ETLs, reset triggers reprocessing on the next scheduled run, not immediately.

**Delete ETL**:
- Click **🗑️ Delete** button  
- Confirm permanent removal

## 🏗️ Architecture

### Backend (Node.js/Express)

- **RavenDB SDK**: Official v6.0.0 client library
- **Certificate Authentication**: Secure PEM-based client certificates
- **Connection Pooling**: Efficient reuse of database connections
- **Operations**: `AddEtlOperation`, `DeleteOngoingTaskOperation`, etc.

### Frontend (Vanilla JavaScript)

- **Monaco Editor**: v0.45.0 for VSCode-like editing experience
- **State Management**: Simple reactive state for connection and collections
- **API Integration**: RESTful communication with backend
- **Responsive Design**: Modern CSS with CSS Variables

## 🔐 Security

- Certificate-based authentication
- Optional API key protection
- Helmet.js CSP (Content Security Policy)
- Rate limiting (100 requests per 15 minutes)
- CORS configuration

## 🛠️ API Endpoints

All endpoints require `POST` method and `Content-Type: application/json` header.

### Authentication
If `API_KEY` is configured in `.env`, include header:
```
X-API-Key: your-secret-api-key-here
```

### Database Connection
| Endpoint | Description | Request Body |
|----------|-------------|--------------|
| `POST /api/connect` | Test RavenDB connection | `{url, database, certificatePath?, certificatePem?}` |
| `POST /api/collections` | List database collections | `{url, database, certificatePath?, certificatePem?}` |
| `POST /api/documents/get` | Get document by ID | `{url, database, certificatePath?, certificatePem?, collectionName, documentId}` |

### ETL Operations
| Endpoint | Description | Request Body |
|----------|-------------|--------------|
| `POST /api/etl/list` | List all ETL tasks | `{url, database, certificatePath?, certificatePem?}` |
| `POST /api/etl/get` | Get ETL details | `{url, database, certificatePath?, certificatePem?, etlName, etlType}` |
| `POST /api/etl/update-transform` | Update transformation script | `{url, database, certificatePath?, certificatePem?, etlName, etlType, script, collections}` |
| `POST /api/etl/update-config` | Update ETL configuration | `{url, database, certificatePath?, certificatePem?, etlName, etlType, config}` |
| `POST /api/etl/run` | Reset ETL state | `{url, database, certificatePath?, certificatePem?, etlName, etlType}` |

### Connection Strings
| Endpoint | Description | Request Body |
|----------|-------------|--------------|
| `POST /api/connection-strings/list` | List all connection strings | `{url, database, certificatePath?, certificatePem?}` |
| `POST /api/connection-strings/create` | Create new connection string | `{url, database, certificatePath?, certificatePem?, connectionStringName, connectionStringType, config}` |
| `POST /api/connection-strings/test` | Test connection string validity | `{url, database, certificatePath?, certificatePem?, connectionStringName}` |
| `POST /api/connection-strings/delete` | Delete connection string | `{url, database, certificatePath?, certificatePem?, connectionStringName}` |

### Response Format

**Success Response**:
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { /* response data */ }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Error message description"
}
```

**Warning Response** (partial success):
```json
{
  "success": true,
  "warning": true,
  "message": "Operation completed with warnings"
}
```

## 📦 Dependencies

### Production
- `express` ^4.18.2 - Web framework
- `ravendb` ^6.0.0 - RavenDB client SDK
- `cors` ^2.8.5 - CORS middleware
- `helmet` ^7.1.0 - Security headers
- `express-rate-limit` ^7.1.5 - Rate limiting
- `dotenv` ^16.3.1 - Environment variables

### Development
- `nodemon` ^3.0.2 - Auto-reload during development

## 📁 Project Structure

```
etl-manager/
├── server.js                     # Express server & API routes
├── package.json                  # Dependencies and scripts
├── .env.example                  # Environment configuration template
├── .gitignore                    # Git ignore rules
├── certs/                        # RavenDB client certificates (gitignored)
│   └── *.pem
└── public/
    ├── index.html                # Main application UI
    ├── app.js                    # Frontend JavaScript logic
    ├── debug.html                # Debug console for testing
    └── debug-app.js              # Debug console script
```

### Key Files

- **server.js**: Express server with all API endpoints, certificate handling, connection pooling
- **public/app.js**: Frontend SPA with state management, Monaco Editor integration, API calls
- **public/index.html**: HTML structure with sidebar navigation and content areas
- **.env**: Configuration for port, API key, CORS, connection pool settings

## 🐛 Troubleshooting

### Common Issues

#### 1. ETL Not Processing After Reset
**Problem**: OLAP ETL shows "reset complete" but data isn't processing.

**Solution**: 
- OLAP ETLs run on a **schedule**, not immediately after reset
- Check ETL configuration for schedule settings
- For immediate processing, use RavenDB Studio to adjust schedule
- Monitor **Stats > ETL** in RavenDB Studio for actual execution

**Verification**:
```
1. Go to RavenDB Studio
2. Navigate to Stats > ETL
3. Check "Last Batch Processed" timestamp
4. Verify ETL is Enabled
5. Review schedule configuration
```

#### 2. Connection String Creation Error
**Problem**: `Invalid connection string configuration. AzureSettings has no valid setting`

**Solution**:
- For OLAP connections, ensure Azure Storage credentials are correct
- Verify `storageContainer` name matches Azure ADLS container
- Check `accountKey` is the full base64 key from Azure Portal
- Test connection manually with Azure Storage Explorer

#### 3. Certificate Authentication Fails
**Problem**: `401 Unauthorized` or certificate errors

**Solutions**:
- Verify certificate is valid and not expired
- Check certificate includes private key (`.pfx` or PEM with key)
- Ensure certificate is authorized in RavenDB cluster settings
- For PEM format, paste full certificate including headers:
  ```
  -----BEGIN CERTIFICATE-----
  ...
  -----END CERTIFICATE-----
  ```

#### 4. API Key Errors
**Problem**: `401 Unauthorized: Invalid API key`

**Solutions**:
- Match `API_KEY` in `.env` with frontend `app.js` line 163
- Or leave `API_KEY` empty in `.env` for development (no auth)
- Clear browser cache and refresh after changing API key
- Verify header format: `X-API-Key: your-key`

#### 5. Port Already in Use
**Problem**: `EADDRINUSE: address already in use :::3000`

**Solutions Windows**:
```powershell
# Find process using port 3000
Get-NetTCPConnection -LocalPort 3000 | Get-Process

# Kill process (replace PID)
Stop-Process -Id PID -Force
```

**Solutions Linux/Mac**:
```bash
# Find and kill process
lsof -ti:3000 | xargs kill -9
```

#### 6. Connection String Test Fails
**Problem**: Newly created connection string fails validation

**Causes & Fixes**:
- **RavenDB Connection**: Verify URL, database name, certificate access
- **OLAP Connection**: Check Azure Storage account exists, container name is correct
- **Network**: Ensure firewall allows outbound connections to Azure/RavenDB
- **Permissions**: Verify certificate/Storage Key has required permissions

### Debug Tools

**Enable Verbose Logging**:
```javascript
// In server.js, add console.log statements
console.log('🔐 Certificate configuration:', { /* details */ });
console.log('📤 Sending request:', requestData);
```

**Use Debug Console**:
- Navigate to `http://localhost:3000/debug.html`
- Test API endpoints directly
- View raw responses and errors

**Check Server Logs**:
```bash
# Real-time log viewing
npm start | tee server.log

# Or use nodemon for dev
npx nodemon server.js
```

## 🚀 Production Deployment

### Pre-Deployment Checklist

- [ ] Set `NODE_ENV=production` in environment
- [ ] Configure strong `API_KEY` (min 32 characters)
- [ ] Set `CORS_ORIGIN` to your production domain
- [ ] Use HTTPS with valid SSL certificate
- [ ] Store certificates securely (never in git)
- [ ] Review and adjust rate limiting settings
- [ ] Set up proper logging (Winston, Morgan, etc.)
- [ ] Configure process manager (PM2, systemd)
- [ ] Enable monitoring (e.g., Prometheus, Grafana)
- [ ] Set up automated backups
- [ ] Document disaster recovery procedures

### Deployment Options

#### Option 1: Traditional Server (VM/VPS)

```bash
# Install PM2 globally
npm install -g pm2

# Start application with PM2
cd etl-manager
pm2 start server.js --name dataloom

# Configure auto-restart on reboot
pm2 startup
pm2 save

# Monitor application
pm2 logs dataloom
pm2 monit
```

#### Option 2: Docker Container

```dockerfile
# Dockerfile (example)
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

```bash
# Build and run
docker build -t dataloom-etl .
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/certs:/app/certs \
  -e API_KEY=your-secure-key \
  --name dataloom \
  dataloom-etl
```

#### Option 3: Azure App Service

```bash
# Login to Azure
az login

# Create App Service
az webapp create \
  --resource-group oppra-resources \
  --plan oppra-plan \
  --name dataloom-etl \
  --runtime "NODE:18-lts"

# Deploy
az webapp up \
  --resource-group oppra-resources \
  --name dataloom-etl
```

### Security Best Practices

1. **API Key Management**:
   - Use environment variables, never hardcode
   - Rotate keys quarterly
   - Use different keys for dev/staging/prod

2. **Certificate Security**:
   - Store in secure vault (Azure Key Vault, AWS Secrets Manager)
   - Never commit to version control
   - Use short-lived certificates when possible
   - Monitor expiration dates

3. **Network Security**:
   - Use HTTPS/TLS for all connections
   - Configure firewall rules
   - Implement IP whitelisting if needed
   - Enable DDoS protection

4. **Monitoring & Alerts**:
   - Log all authentication attempts
   - Monitor ETL execution failures
   - Alert on certificate expiration (30 days before)
   - Track API response times
   - Set up health check endpoints

## 🎯 OPPRA Project Integration

DataLoom is specifically designed for the OPPRA project, providing:
- **Seamless RavenDB Integration**: Direct connection to OPPRA's RavenDB clusters
- **OLAP/Parquet Export**: Export data to Azure Data Lake for analytics and reporting
- **Real-time Data Sync**: Keep multiple databases synchronized
- **Enterprise Workflows**: Production-ready ETL processes with monitoring

## 🗺️ Roadmap

### Upcoming Features
- [ ] **ETL Execution History**: View past execution logs and statistics
- [ ] **Scheduled Backups**: Automated ETL configuration backups
- [ ] **Performance Metrics**: Dashboard with ETL throughput and latency
- [ ] **Notification System**: Email/Slack alerts for ETL failures
- [ ] **Multi-user Support**: User authentication and role-based access
- [ ] **ETL Templates**: Pre-configured transformation templates
- [ ] **Bulk Operations**: Import/export multiple ETLs at once
- [ ] **Visual Query Builder**: Drag-and-drop transformation creator

### Completed (Recent Updates)
- [x] Connection String management tab
- [x] Auto-test connection strings on creation
- [x] Manual connection string testing (🧪 button)
- [x] Reset ETL state functionality
- [x] Warning alerts for partial failures
- [x] Connection pooling optimization
- [x] Certificate-based authentication
- [x] Monaco Editor integration

## 📸 Screenshots

### Main Dashboard
![Dashboard](docs/screenshots/dashboard.png)

### ETL Task Management
![ETL Tasks](docs/screenshots/etl-tasks.png)

### Connection Strings
![Connection Strings](docs/screenshots/connection-strings.png)

### Monaco Editor
![Code Editor](docs/screenshots/monaco-editor.png)


## 🤝 Contributing

This is a private project for OPPRA. For internal contributors:

1. **Create a feature branch** from `main`
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Follow code style**:
   - Use English for all comments and variable names
   - Follow existing patterns (see [code-preferences](/memories/code-preferences.md))
   - Add JSDoc comments for functions
   - Keep functions focused and under 50 lines

3. **Test your changes**:
   - Test with multiple RavenDB instances
   - Verify connection string operations
   - Check ETL reset functionality
   - Test with both certificate types (PEM/PFX)

4. **Commit with descriptive messages**:
   ```bash
   git commit -m "feat: add ETL execution history view"
   git commit -m "fix: resolve certificate validation error"
   git commit -m "docs: update API endpoints documentation"
   ```

5. **Push and create PR**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Code Style Guidelines

**Backend (server.js)**:
- Use `async/await` over promises
- Include error logging with context
- Validate all inputs before processing
- Use connection pooling for all RavenDB operations

**Frontend (app.js)**:
- Keep state management simple
- Use descriptive function names
- Add loading states for all async operations
- Provide user feedback for all actions

## 📄 License

**Proprietary** - IntegrIdia

This software is confidential and proprietary to **IntegrIdia**. Unauthorized copying, distribution, or use is strictly prohibited.

© 2026 IntegrIdia. All rights reserved.

## 📞 Contact & Support

**Project Lead**: Idia Herrera
**Email**: idia.herrera@gmail.com  

### Acknowledgments

**Built with**:
- [RavenDB](https://ravendb.net/) - NoSQL database
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [Express.js](https://expressjs.com/) - Web framework

**Special Thanks**:
- RavenDB Community
- Microsoft Monaco Team
---

## 🔗 Related Resources

- [RavenDB Documentation](https://ravendb.net/docs/)
- [RavenDB ETL Guide](https://ravendb.net/docs/article-page/6.0/nodejs/server/ongoing-tasks/etl/basics)
- [OLAP ETL Documentation](https://ravendb.net/docs/article-page/6.0/nodejs/server/ongoing-tasks/etl/olap)
- [Azure Data Lake Storage](https://docs.microsoft.com/azure/storage/blobs/data-lake-storage-introduction)

---

**DataLoom** - Weaving data transformations with precision 🧵✨

*Built with ❤️ for OPPRA Project | Powered by RavenDB*

