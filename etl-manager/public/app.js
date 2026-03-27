// ═══════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════

const state = {
  connection: {
    url: '',
    database: '',
    certPath: '',
    certPem: null,
    connected: false
  },
  collections: [],
  connectionStrings: [],
  selectedCollections: [],
  editor: null,
  queryEditor: null,
  modalEditor: null, // Monaco Editor instance for ETL details modal
  currentEtl: null,
  currentEtlDetails: null, // Store full ETL details for viewing
  currentTransformIndex: null, // Track which transform is currently selected in modal
  hasUnsavedChanges: false, // Track if there are unsaved changes in modal editor
  currentCollectionView: null, // Track which collection is being viewed in details
  returnToEtlModal: false  // Track if we should return to ETL modal after creating connection string
};

// ═══════════════════════════════════════════════════════════
// SESSION PERSISTENCE
// ═══════════════════════════════════════════════════════════

function saveSession() {
  try {
    const sessionData = {
      url: state.connection.url,
      database: state.connection.database,
      certPem: state.connection.certPem,
      certPath: state.connection.certPath,
      timestamp: Date.now()
    };
    localStorage.setItem('ravenDBSession', JSON.stringify(sessionData));
    console.log('💾 Session saved to localStorage');
  } catch (error) {
    console.error('Failed to save session:', error);
  }
}

function loadSession() {
  try {
    const sessionData = localStorage.getItem('ravenDBSession');
    if (!sessionData) return null;
    
    const data = JSON.parse(sessionData);
    
    // Check if session is not older than 24 hours
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (Date.now() - data.timestamp > twentyFourHours) {
      console.log('Session expired, clearing...');
      clearSession();
      return null;
    }
    
    console.log('📂 Session loaded from localStorage');
    return data;
  } catch (error) {
    console.error('Failed to load session:', error);
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem('ravenDBSession');
    console.log('🗑️ Session cleared');
  } catch (error) {
    console.error('Failed to clear session:', error);
  }
}

// ═══════════════════════════════════════════════════════════
// MONACO EDITOR INITIALIZATION
// ═══════════════════════════════════════════════════════════

// Ensure DOM is loaded before initializing Monaco
function initMonacoEditor() {
  require.config({ 
    paths: { 
      vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' 
    } 
  });

  require(['vs/editor/editor.main'], function() {
    console.log('Monaco Editor loaded, initializing...');
    
    const container = document.getElementById('monaco-editor');
    if (!container) {
      console.error('Monaco editor container not found!');
      return;
    }

    console.log('Container found:', container, 'Dimensions:', container.offsetWidth, 'x', container.offsetHeight);

    try {
      state.editor = monaco.editor.create(container, {
        value: getDefaultTransformScript(),
        language: 'javascript',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: true },
        fontSize: 14,
        tabSize: 2,
        formatOnPaste: true,
        formatOnType: true,
        scrollBeyondLastLine: false,
        lineNumbers: 'on',
        renderWhitespace: 'selection'
      });

      console.log('Monaco Editor created successfully!');

      // Force initial layout
      setTimeout(() => {
        if (state.editor) {
          state.editor.layout();
          console.log('Monaco Editor layout updated');
        }
      }, 100);

      // Add custom RavenDB ETL snippets
      monaco.languages.registerCompletionItemProvider('javascript', {
        provideCompletionItems: () => {
          return {
            suggestions: [
              {
                label: 'loadTo',
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: 'loadTo${1:TableName}(${2:object});',
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: 'Load transformed document to target table/collection'
              },
              {
                label: 'id',
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: 'id(${1:this})',
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: 'Get document ID'
              }
            ]
          };
        }
      });

    } catch (error) {
      console.error('Error creating Monaco Editor:', error);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// API CALLS
// ═══════════════════════════════════════════════════════════

const API_BASE = window.location.origin;
const API_KEY = ''; // Set this if your server requires an API key

async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  const options = { method, headers };
  
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }
  
  return data;
}

function getConnectionParams() {
  return {
    url: state.connection.url,
    database: state.connection.database,
    certificatePath: state.connection.certPath
  };
}

// ═══════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════

// Helper function to read file as text
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function showAlert(message, type = 'info') {
  const container = document.getElementById('alertContainer');
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type}`;
  
  const messageSpan = document.createElement('span');
  messageSpan.textContent = message;
  
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = 'margin-left: auto; background: none; border: none; cursor: pointer; font-size: 18px;';
  closeBtn.addEventListener('click', () => alertDiv.remove());
  
  alertDiv.appendChild(messageSpan);
  alertDiv.appendChild(closeBtn);
  container.appendChild(alertDiv);
  
  setTimeout(() => alertDiv.remove(), 5000);
}

function updateConnectionStatus(connected) {
  const indicator = document.getElementById('connectionStatus');
  indicator.className = `status-indicator ${connected ? 'status-connected' : 'status-disconnected'}`;
  state.connection.connected = connected;
  
  // Toggle connect/disconnect buttons
  const connectBtn = document.getElementById('connectBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  
  if (connected) {
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = 'block';
  } else {
    connectBtn.style.display = 'block';
    disconnectBtn.style.display = 'none';
  }
}



function getDefaultTransformScript() {
  return `// RavenDB ETL Transformation Script
//
// Available functions:
// - id(doc)          : Get document ID
// - loadTo<Name>(obj): Load transformed object to target
//
// Example: Transform Customer document

var transformed = {
  Id: id(this),
  Name: this.Name,
  Email: this.Email,
  City: this.Address ? this.Address.City : null,
  Country: this.Address ? this.Address.Country : null,
  
  // Flatten nested objects
  CreditLimit: this.CreditLimit,
  Currency: this.Currency,
  
  // Add metadata
  ProcessedAt: new Date().toISOString()
};

// Load to target collection/table
loadToCustomers(transformed);
`;
}

// ═══════════════════════════════════════════════════════════
// EVENT HANDLERS - Wrapped in initialization function
// ═══════════════════════════════════════════════════════════

function initializeEventListeners() {
  console.log('🔧 Initializing event listeners...');

  const testBtn = document.getElementById('testBtn');
  const saveBtn = document.getElementById('saveBtn');
  const connectBtn = document.getElementById('connectBtn');
  
  console.log('🔍 Button elements found:', {
    testBtn: !!testBtn,
    saveBtn: !!saveBtn,
    connectBtn: !!connectBtn
  });

  document.getElementById('connectBtn').addEventListener('click', async () => {
    const btn = document.getElementById('connectBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Connecting...';
    
    try {
      state.connection.url = document.getElementById('ravenUrl').value;
      state.connection.database = document.getElementById('database').value;
      state.connection.certPath = document.getElementById('certPath').value;

      // Check if user selected a file
      const fileInput = document.getElementById('certFile');
      const connectionParams = getConnectionParams();
      
      if (fileInput.files.length > 0) {
        // Read certificate file content
        const file = fileInput.files[0];
        const certContent = await readFileAsText(file);
        connectionParams.certificatePem = certContent;
        connectionParams.certificatePath = ''; // Clear path when using file
      }

      await apiCall('/api/connect', 'POST', connectionParams);
      
      updateConnectionStatus(true);
      saveSession(); // Save session to localStorage
      showAlert('Connected to RavenDB successfully', 'success');
      
      // Auto-load collections, connection strings, and ETL tasks
      await loadCollections();
      await loadConnectionStrings();
      await loadEtlTasks();
      
    } catch (error) {
      updateConnectionStatus(false);
      showAlert(`Connection failed: ${error.message}`, 'error');
      clearSession(); // Clear invalid session
    } finally {
      btn.disabled = false;
      btn.textContent = 'Connect';
    }
  });

  // Disconnect button
  document.getElementById('disconnectBtn').addEventListener('click', () => {
    state.connection.connected = false;
    state.connection.url = '';
    state.connection.database = '';
    state.connection.certPath = '';
    state.connection.certPem = null;
    state.collections = [];
    state.connectionStrings = [];
    state.selectedCollections = [];
    
    updateConnectionStatus(false);
    clearSession();
    
    // Clear UI
    document.getElementById('selectedCollections').textContent = 'No collections selected';
    
    const etlTasksList = document.getElementById('etlTasksList');
    etlTasksList.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
        <h3 style="font-size: 18px; margin-bottom: 8px; color: var(--text-primary);">Disconnected</h3>
        <p style="font-size: 14px;">Connect to your RavenDB database to view and manage ETL tasks.</p>
      </div>
    `;
    
    showAlert('Disconnected from RavenDB', 'info');
  });

  // Store certificate PEM in state when file is selected
  document.getElementById('certFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const content = await readFileAsText(file);
        state.connection.certPem = content;
        document.getElementById('certPath').value = file.name;
        showAlert(`Certificate file loaded: ${file.name}`, 'info');
      } catch (error) {
        showAlert(`Failed to read certificate file: ${error.message}`, 'error');
      }
    }
  });

  // Connection string management
  document.getElementById('newConnectionStringBtn').addEventListener('click', () => {
    document.getElementById('connectionStringModal').classList.add('active');
  });

  document.getElementById('cancelConnectionStringBtn').addEventListener('click', () => {
    document.getElementById('connectionStringModal').classList.remove('active');
  });

  document.getElementById('closeConnectionStringModalBtn').addEventListener('click', () => {
    document.getElementById('connectionStringModal').classList.remove('active');
  });

  document.getElementById('csType').addEventListener('change', (e) => {
    const olapFields = document.getElementById('olapFields');
    const ravenFields = document.getElementById('ravenDbFields');
    
    if (e.target.value === 'OLAP') {
      olapFields.style.display = 'block';
      ravenFields.style.display = 'none';
    } else {
      olapFields.style.display = 'none';
      ravenFields.style.display = 'block';
    }
  });

  document.getElementById('saveConnectionStringBtn').addEventListener('click', async () => {
    const name = document.getElementById('csName').value;
    const type = document.getElementById('csType').value;
    
    if (!name) {
      showAlert('Please enter a connection string name', 'error');
      return;
    }
    
    const btn = document.getElementById('saveConnectionStringBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Creating...';
    
    try {
      const connectionParams = getConnectionParams();
      if (state.connection.certPem) {
        connectionParams.certificatePem = state.connection.certPem;
        connectionParams.certificatePath = '';
      }
      
      let config = {};
      
      if (type === 'OLAP') {
        const accountName = document.getElementById('csAccountName').value;
        const accountKey = document.getElementById('csAccountKey').value;
        const containerName = document.getElementById('csContainerName').value;
        const remoteFolder = document.getElementById('csRemoteFolder').value;
        
        if (!accountName || !accountKey || !containerName) {
          showAlert('Please fill all required ADLS fields', 'error');
          btn.disabled = false;
          btn.textContent = 'Create Connection String';
          return;
        }
        
        config.azureSettings = {
          accountName,
          accountKey,
          containerName,
          remoteFolderName: remoteFolder
        };
      } else {
        const ravenUrl = document.getElementById('csRavenUrl').value;
        const ravenDb = document.getElementById('csRavenDatabase').value;
        
        if (!ravenUrl || !ravenDb) {
          showAlert('Please fill all required RavenDB fields', 'error');
          btn.disabled = false;
          btn.textContent = 'Create Connection String';
          return;
        }
        
        config.urls = [ravenUrl];
        config.database = ravenDb;
      }
      
      await apiCall('/api/connection-strings/create', 'POST', {
        ...connectionParams,
        connectionStringName: name,
        connectionStringType: type,
        config
      });
      
      showAlert(`✓ Connection string '${name}' created successfully`, 'success');
      
      // Test the connection string immediately after creation
      btn.innerHTML = '<span class="loading"></span> Testing connection...';
      
      try {
        const testResponse = await fetch('/api/connection-strings/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': state.connection.apiKey || ''
          },
          body: JSON.stringify({
            ...connectionParams,
            connectionStringName: name
          })
        });
        
        const testResult = await testResponse.json();
        
        if (testResponse.ok && testResult.success) {
          showAlert(`✅ Connection string '${name}' created and validated successfully!`, 'success');
        } else {
          showAlert(`⚠️ Connection string '${name}' created but validation failed: ${testResult.error || 'Unknown error'}`, 'warning');
        }
      } catch (testError) {
        console.warn('Connection string test failed:', testError);
        showAlert(`⚠️ Connection string '${name}' created but could not be tested`, 'warning');
      }
      
      // Reload connection strings and close modal
      await loadConnectionStrings();
      loadConnectionStringsForModal();  // Update modal selector too
      
      document.getElementById('connectionStringModal').classList.remove('active');
      
      // Return to ETL modal if it was opened from there
      if (state.returnToEtlModal) {
        state.returnToEtlModal = false;
        document.getElementById('etlCreationModal').classList.add('active');
      }
      
      // Clear form
      document.getElementById('csName').value = '';
      document.getElementById('csAccountName').value = '';
      document.getElementById('csAccountKey').value = '';
      document.getElementById('csContainerName').value = '';
      document.getElementById('csRemoteFolder').value = '';
      document.getElementById('csRavenUrl').value = '';
      document.getElementById('csRavenDatabase').value = '';
      
    } catch (error) {
      showAlert(`Failed to create connection string: ${error.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Connection String';
    }
  });

  document.getElementById('testBtn').addEventListener('click', async () => {
    console.log('🧪 Test button clicked');
    console.log('📦 Selected collections:', state.selectedCollections);
    console.log('📦 Collection count:', state.selectedCollections.length);
    
    if (state.selectedCollections.length === 0) {
      console.error('❌ No collections selected');
      showAlert('Please select at least one collection', 'error');
      return;
    }

    const script = state.editor.getValue();
    console.log('📝 Script to test:', script.substring(0, 100) + '...');
    
    const btn = document.getElementById('testBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Testing...';
    
    try {
      console.log('🌐 Calling API /api/etl/test...');
      const result = await apiCall('/api/etl/test', 'POST', {
        transformScript: script
      });
      
      console.log('✅ Test result:', result);
      showAlert('✓ Script syntax valid', 'success');
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      showAlert(`Test failed: ${error.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Test Script';
    }
  });

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const etlName = document.getElementById('etlName').value;
    const etlType = document.getElementById('etlType').value;
    const connectionStringName = document.getElementById('connectionStringSelector').value;
    
    console.log('💾 Save ETL clicked');
    console.log('📝 ETL Name:', etlName);
    console.log('🔌 Connection String Name:', connectionStringName);
    console.log('📦 Collections:', state.selectedCollections);
    console.log('🗂️ Available connection strings:', state.connectionStrings.map(cs => cs.name));
    
    if (!etlName) {
      showAlert('Please enter an ETL name', 'error');
      return;
    }
    
    if (!connectionStringName) {
      showAlert('Please select a connection string', 'error');
      return;
    }
    
    if (state.selectedCollections.length === 0) {
      showAlert('Please select at least one collection', 'error');
      return;
    }

    const script = state.editor.getValue();
    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Saving...';
    
    try {
      const connectionParams = getConnectionParams();
      if (state.connection.certPem) {
        connectionParams.certificatePem = state.connection.certPem;
        connectionParams.certificatePath = '';
      }
      
      const payload = {
        ...connectionParams,
        etlName,
        etlType,
        connectionStringName,
        collections: state.selectedCollections,
        transformScript: script
      };
      
      console.log('📤 Sending ETL payload:', JSON.stringify(payload, null, 2));
      
      const result = await apiCall('/api/etl/create', 'POST', payload);
      
      if (result.type === 'OlapEtl') {
        showAlert(`✓ OLAP ETL '${etlName}' created! Data will export to ADLS using '${connectionStringName}'`, 'success');
      } else {
        showAlert(`✓ ETL '${etlName}' created successfully using '${connectionStringName}'`, 'success');
      }
      
    } catch (error) {
      console.error('❌ ETL save error:', error);
      showAlert(`Save failed: ${error.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save ETL';
    }
  });

  // Tab navigation
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabName = tab.getAttribute('data-tab');
      const editorView = document.getElementById('editorView');
      const tasksView = document.getElementById('tasksView');
      const collectionsTabView = document.getElementById('collectionsTabView');
      const connectionStringsTabView = document.getElementById('connectionStringsTabView');
      const collectionDetailsView = document.getElementById('collectionDetailsView');
      const newEtlBtn = document.getElementById('newEtlBtn');
      const testBtn = document.getElementById('testBtn');
      const saveBtn = document.getElementById('saveBtn');
      
      if (tabName === 'collections') {
        editorView.style.display = 'none';
        tasksView.style.display = 'none';
        collectionsTabView.style.display = 'block';
        connectionStringsTabView.style.display = 'none';
        collectionDetailsView.style.display = 'none';
        newEtlBtn.style.display = 'none';
        testBtn.style.display = 'none';
        saveBtn.style.display = 'none';
        renderCollectionsInTab();
      } else if (tabName === 'connectionStrings') {
        editorView.style.display = 'none';
        tasksView.style.display = 'none';
        collectionsTabView.style.display = 'none';
        connectionStringsTabView.style.display = 'block';
        collectionDetailsView.style.display = 'none';
        newEtlBtn.style.display = 'none';
        testBtn.style.display = 'none';
        saveBtn.style.display = 'none';
        renderConnectionStringsInTab();
      } else if (tabName === 'tasks') {
        editorView.style.display = 'none';
        tasksView.style.display = 'block';
        collectionsTabView.style.display = 'none';
        connectionStringsTabView.style.display = 'none';
        collectionDetailsView.style.display = 'none';
        newEtlBtn.style.display = 'inline-flex';
        testBtn.style.display = 'none';
        saveBtn.style.display = 'none';
        loadEtlTasks();
      } else {
        editorView.style.display = 'block';
        tasksView.style.display = 'none';
        collectionsTabView.style.display = 'none';
        connectionStringsTabView.style.display = 'none';
        collectionDetailsView.style.display = 'none';
        newEtlBtn.style.display = 'none';
        testBtn.style.display = 'inline-flex';
        saveBtn.style.display = 'inline-flex';
        
        setTimeout(() => {
          if (state.editor) {
            state.editor.layout();
          }
        }, 50);
      }
    });
  });

  // New ETL Button
  document.getElementById('newEtlBtn').addEventListener('click', () => {
    openEtlCreationModal();
  });

  // Modal Cancel Button
  document.getElementById('modalCancelBtn').addEventListener('click', () => {
    document.getElementById('etlCreationModal').classList.remove('active');
  });

  // Modal Test Button
  document.getElementById('modalTestBtn').addEventListener('click', async () => {
    const collectionsSelector = document.getElementById('modalCollectionsSelector');
    const selectedOptions = Array.from(collectionsSelector.selectedOptions);
    const selectedCollections = selectedOptions.map(opt => opt.value);

    if (selectedCollections.length === 0) {
      showAlert('Please select at least one collection', 'error');
      return;
    }

    const script = modalEditor ? modalEditor.getValue() : '';
    const btn = document.getElementById('modalTestBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Testing...';
    
    try {
      const result = await apiCall('/api/etl/test', 'POST', {
        transformScript: script
      });
      
      showAlert('✓ Script syntax valid', 'success');
      
    } catch (error) {
      showAlert(`Test failed: ${error.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>🧪</span> Test Script';
    }
  });

  // Modal Save Button
  document.getElementById('modalSaveBtn').addEventListener('click', async () => {
    const etlName = document.getElementById('modalEtlName').value;
    const etlType = document.getElementById('modalEtlType').value;
    const connectionStringName = document.getElementById('modalConnectionStringSelector').value;
    const collectionsSelector = document.getElementById('modalCollectionsSelector');
    const selectedOptions = Array.from(collectionsSelector.selectedOptions);
    const selectedCollections = selectedOptions.map(opt => opt.value);
    
    if (!etlName) {
      showAlert('Please enter an ETL name', 'error');
      return;
    }
    
    if (!connectionStringName) {
      showAlert('Please select a connection string', 'error');
      return;
    }
    
    if (selectedCollections.length === 0) {
      showAlert('Please select at least one collection', 'error');
      return;
    }

    const script = modalEditor ? modalEditor.getValue() : '';
    const btn = document.getElementById('modalSaveBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Creating...';
    
    try {
      const connectionParams = getConnectionParams();
      if (state.connection.certPem) {
        connectionParams.certificatePem = state.connection.certPem;
        connectionParams.certificatePath = '';
      }
      
      const payload = {
        ...connectionParams,
        etlName,
        etlType,
        connectionStringName,
        collections: selectedCollections,
        transformScript: script
      };
      
      const result = await apiCall('/api/etl/create', 'POST', payload);
      
      if (result.type === 'OlapEtl') {
        showAlert(`✓ OLAP ETL '${etlName}' created! Data will export using '${connectionStringName}'`, 'success');
      } else {
        showAlert(`✓ ETL '${etlName}' created successfully using '${connectionStringName}'`, 'success');
      }
      
      // Close modal and refresh tasks
      document.getElementById('etlCreationModal').classList.remove('active');
      await loadEtlTasks();
      
      // Clear form
      document.getElementById('modalEtlName').value = '';
      document.getElementById('modalEtlType').value = 'RavenEtl';
      document.getElementById('modalConnectionStringSelector').value = '';
      document.getElementById('modalCollectionsSelector').selectedIndex = -1;
      if (modalEditor) {
        modalEditor.setValue(getDefaultTransformScript());
      }
      
    } catch (error) {
      showAlert(`Save failed: ${error.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>💾</span> Create ETL Task';
    }
  });

  // Modal close handlers
  const modal = document.getElementById('etlCreationModal');
  const modalContent = modal.querySelector('.modal-content');
  
  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
  
  // Close on close button click
  const modalCloseBtn = modal.querySelector('.modal-close');
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }

  // New Connection String button from ETL modal
  document.getElementById('modalNewConnectionBtn').addEventListener('click', () => {
    state.returnToEtlModal = true;
    document.getElementById('etlCreationModal').classList.remove('active');
    document.getElementById('connectionStringModal').classList.add('active');
  });

  // Collection Details Modal close handler
  const collectionModal = document.getElementById('collectionDetailsModal');
  if (collectionModal) {
    collectionModal.addEventListener('click', (e) => {
      if (e.target === collectionModal) {
        collectionModal.classList.remove('active');
      }
    });
  }

  // Refresh tasks button
  const refreshBtn = document.getElementById('refreshTasksBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadEtlTasks);
  }

  // Refresh collections tab button
  const refreshCollectionsTabBtn = document.getElementById('refreshCollectionsTabBtn');
  if (refreshCollectionsTabBtn) {
    refreshCollectionsTabBtn.addEventListener('click', async () => {
      await loadCollections();
      renderCollectionsInTab();
    });
  }

  // Refresh connection strings tab button
  const refreshConnectionStringsTabBtn = document.getElementById('refreshConnectionStringsTabBtn');
  if (refreshConnectionStringsTabBtn) {
    refreshConnectionStringsTabBtn.addEventListener('click', async () => {
      await loadConnectionStrings();
      renderConnectionStringsInTab();
    });
  }

  // Add connection string button (in connection strings tab)
  const addConnectionStringTabBtn = document.getElementById('addConnectionStringTabBtn');
  if (addConnectionStringTabBtn) {
    addConnectionStringTabBtn.addEventListener('click', () => {
      document.getElementById('connectionStringModal').classList.add('active');
    });
  }

  // Add ETL Task button (in tasks view)
  const addEtlTaskBtn = document.getElementById('addEtlTaskBtn');
  if (addEtlTaskBtn) {
    addEtlTaskBtn.addEventListener('click', () => {
      openEtlCreationModal();
    });
  }

  // Back to collections button (in collection details view)
  const backToCollectionsBtn = document.getElementById('backToCollectionsBtn');
  if (backToCollectionsBtn) {
    backToCollectionsBtn.addEventListener('click', () => {
      document.getElementById('collectionDetailsView').style.display = 'none';
      
      // Go back to collections tab if it was active, otherwise to tasks view
      const collectionsTab = document.querySelector('[data-tab="collections"]');
      if (collectionsTab && collectionsTab.classList.contains('active')) {
        document.getElementById('collectionsTabView').style.display = 'block';
      } else {
        document.getElementById('tasksView').style.display = 'block';
      }
    });
  }

  // Collection detail tabs
  document.querySelectorAll('.collection-detail-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-detail-tab');
      
      // Update active tab
      document.querySelectorAll('.collection-detail-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show/hide content
      if (tabName === 'documents') {
        document.getElementById('documentsTabContent').style.display = 'block';
        document.getElementById('queryTabContent').style.display = 'none';
      } else if (tabName === 'query') {
        document.getElementById('documentsTabContent').style.display = 'none';
        document.getElementById('queryTabContent').style.display = 'block';
        
        // Initialize query editor if not already done
        if (!state.queryEditor) {
          initializeQueryEditor();
        }
      }
    });
  });

  // Run query button
  const btnRunQuery = document.getElementById('btnRunQuery');
  if (btnRunQuery) {
    btnRunQuery.addEventListener('click', runCollectionQuery);
  }

  console.log('Event listeners initialized successfully!');
} // End of initializeEventListeners

// Helper functions called by event listeners

async function loadConnectionStrings() {
  try {
    const connectionParams = getConnectionParams();
    if (state.connection.certPem) {
      connectionParams.certificatePem = state.connection.certPem;
      connectionParams.certificatePath = '';
    }
    
    const data = await apiCall('/api/connection-strings/list', 'POST', connectionParams);
    state.connectionStrings = data.connectionStrings;
    
    const selector = document.getElementById('connectionStringSelector');
    selector.innerHTML = '<option value="">-- Select connection string --</option>';
    
    data.connectionStrings.forEach(cs => {
      const option = document.createElement('option');
      option.value = cs.name;
      option.textContent = `${cs.name} (${cs.type}${cs.destination ? ': ' + cs.destination : ''})`;
      selector.appendChild(option);
    });
    
    showAlert(`Loaded ${data.connectionStrings.length} connection string(s)`, 'info');
  } catch (error) {
    console.error('Failed to load connection strings:', error);
    showAlert(`Failed to load connection strings: ${error.message}`, 'error');
  }
}

async function loadCollections() {
  if (!state.connection.connected) {
    showAlert('Please connect to database first', 'error');
    return;
  }
  
  try {
    const connectionParams = getConnectionParams();
    if (state.connection.certPem) {
      connectionParams.certificatePem = state.connection.certPem;
      connectionParams.certificatePath = '';
    }
    
    const data = await apiCall('/api/collections', 'POST', connectionParams);
    state.collections = data.collections;
    
    renderCollectionsInTab(); // Update tab view
    showAlert(`Loaded ${state.collections.length} collections`, 'success');
    
  } catch (error) {
    showAlert(`Failed to load collections: ${error.message}`, 'error');
  }
}

window.toggleCollection = function(name) {
  // Only keep the last visited collection
  state.selectedCollections = [name];
  console.log('📦 Collections selected:', state.selectedCollections);
  renderCollectionsInTab(); // Re-render to update visual state
};

function renderCollectionsInTab() {
  const container = document.getElementById('collectionsTabList');
  
  if (!state.collections || state.collections.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 40px;">No collections found. Connect to database and collections will load automatically.</div>';
    return;
  }
  
  container.innerHTML = state.collections.map(col => {
    const isSelected = state.selectedCollections.includes(col.name);
    return `
    <div class="collection-item" data-collection-name="${col.name}" style="cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; margin-bottom: 6px; background: var(--bg-elevated); border-radius: 6px; border: 1px solid ${isSelected ? 'var(--success)' : 'var(--border)'}; transition: all 0.2s;">
      <div style="display: flex; align-items: center; gap: 8px;">
        ${isSelected ? '<span style="color: var(--success);">✓</span>' : '<span style="color: var(--text-secondary);">🗄️</span>'}
        <span style="font-size: 13px; color: var(--text-primary);">${col.name}</span>
      </div>
      <span class="collection-count" style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">${col.count.toLocaleString()}</span>
    </div>
  `;
  }).join('');
  
  // Add click event listeners
  container.querySelectorAll('.collection-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const collectionName = item.dataset.collectionName;
      openCollectionDetails(collectionName);
    });
    
    // Hover effect
    item.addEventListener('mouseenter', (e) => {
      if (!state.selectedCollections.includes(item.dataset.collectionName)) {
        item.style.borderColor = 'var(--border-light)';
        item.style.background = 'var(--bg-card)';
      }
    });
    item.addEventListener('mouseleave', (e) => {
      if (!state.selectedCollections.includes(item.dataset.collectionName)) {
        item.style.borderColor = 'var(--border)';
        item.style.background = 'var(--bg-elevated)';
      }
    });
  });
}

function renderConnectionStringsInTab() {
  const container = document.getElementById('connectionStringsTabList');
  
  if (!state.connection.connected) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 40px;">Connect to database first</div>';
    return;
  }
  
  if (!state.connectionStrings || state.connectionStrings.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 40px;">No connection strings found. Click "Add New" to create one.</div>';
    return;
  }
  
  container.innerHTML = state.connectionStrings.map(cs => {
    const typeLabel = cs.type === 'Raven' ? '🗄️ RavenDB' : '📊 OLAP/ADLS';
    const destination = cs.destination || cs.connectionString || 'No destination specified';
    
    return `
    <div class="connection-string-item" style="display: flex; justify-content: space-between; align-items: center; padding: 16px; margin-bottom: 12px; background: var(--bg-elevated); border-radius: 8px; border: 1px solid var(--border); transition: all 0.2s;">
      <div style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
          <span style="font-size: 16px;">${typeLabel}</span>
          <span style="font-size: 15px; font-weight: 600; color: var(--text-primary);">${cs.name}</span>
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${destination}
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn-icon test-cs-btn" 
                data-cs-name="${cs.name}"
                title="Test Connection String"
                style="background: var(--primary); color: white; padding: 8px 12px;">
          🧪 Test
        </button>
        <button class="btn-icon delete-cs-btn" 
                data-cs-name="${cs.name}"
                title="Delete Connection String"
                style="background: var(--danger); color: white; padding: 8px 12px;">
          🗑️ Delete
        </button>
      </div>
    </div>
  `;
  }).join('');
  
  // Add click event listeners for test buttons
  container.querySelectorAll('.test-cs-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const csName = btn.getAttribute('data-cs-name');
      await testConnectionString(csName);
    });
  });
  
  // Add click event listeners for delete buttons
  container.querySelectorAll('.delete-cs-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const csName = btn.getAttribute('data-cs-name');
      await deleteConnectionString(csName);
    });
  });
  
  // Hover effects
  container.querySelectorAll('.connection-string-item').forEach(item => {
    item.addEventListener('mouseenter', () => {
      item.style.borderColor = 'var(--border-light)';
      item.style.background = 'var(--bg-card)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.borderColor = 'var(--border)';
      item.style.background = 'var(--bg-elevated)';
    });
  });
}

async function testConnectionString(connectionStringName) {
  try {
    const connectionParams = getConnectionParams();
    if (state.connection.certPem) {
      connectionParams.certificatePem = state.connection.certPem;
      connectionParams.certificatePath = '';
    }
    
    // Show loading state
    showAlert(`🧪 Testing connection string "${connectionStringName}"...`, 'info');
    
    const response = await fetch('/api/connection-strings/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': state.connection.apiKey || ''
      },
      body: JSON.stringify({
        ...connectionParams,
        connectionStringName: connectionStringName
      })
    });
    
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to test connection string');
    }
    
    showAlert(`✅ Connection string "${connectionStringName}" is valid and accessible!`, 'success');
    
  } catch (error) {
    showAlert(`❌ Test failed for "${connectionStringName}": ${error.message}`, 'error');
    console.error('Test connection string error:', error);
  }
}

async function deleteConnectionString(connectionStringName) {
  if (!confirm(`Are you sure you want to delete connection string:\n\n"${connectionStringName}"\n\nThis action cannot be undone.`)) {
    return;
  }
  
  try {
    const connectionParams = getConnectionParams();
    if (state.connection.certPem) {
      connectionParams.certificatePem = state.connection.certPem;
      connectionParams.certificatePath = '';
    }
    
    const response = await fetch('/api/connection-strings/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': state.connection.apiKey || ''
      },
      body: JSON.stringify({
        ...connectionParams,
        connectionStringName: connectionStringName
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete connection string');
    }
    
    const result = await response.json();
    
    showAlert(`✅ Connection string "${connectionStringName}" deleted successfully!`, 'success');
    
    // Reload connection strings and refresh the view
    await loadConnectionStrings();
    renderConnectionStringsInTab();
    
  } catch (error) {
    showAlert(`❌ Error deleting connection string: ${error.message}`, 'error');
    console.error('Delete connection string error:', error);
  }
}

function openCollectionDetails(collectionName) {
  const collection = state.collections.find(c => c.name === collectionName);
  if (!collection) return;
  
  // Store current collection name
  state.currentCollectionView = collectionName;
  
  // Update view content
  document.getElementById('viewCollectionName').textContent = collection.name;
  document.getElementById('viewDocumentCount').textContent = collection.count.toLocaleString();
  
  // Update button states
  const isSelected = state.selectedCollections.includes(collectionName);
  const addBtn = document.getElementById('viewAddToEtlBtn');
  const removeBtn = document.getElementById('viewRemoveFromEtlBtn');
  
  if (isSelected) {
    addBtn.style.display = 'none';
    removeBtn.style.display = 'inline-flex';
  } else {
    addBtn.style.display = 'inline-flex';
    removeBtn.style.display = 'none';
  }
  
  // Set up button click handlers
  addBtn.onclick = () => {
    // Add collection to selected list if not already there
    if (!state.selectedCollections.includes(collectionName)) {
      toggleCollection(collectionName);
    }
    
    // Open ETL creation modal directly with collection pre-selected
    openEtlCreationModal();
  };
  
  removeBtn.onclick = () => {
    state.selectedCollections = [];
    console.log('📦 Collection removed from ETL selection');
    addBtn.style.display = 'inline-flex';
    removeBtn.style.display = 'none';
    renderCollectionsInTab();
  };
  
  // Switch views
  document.getElementById('tasksView').style.display = 'none';
  document.getElementById('collectionsTabView').style.display = 'none';
  document.getElementById('collectionDetailsView').style.display = 'block';
  
  // Update query editor with collection name if editor is initialized
  if (state.queryEditor) {
    state.queryEditor.setValue(`from '${collectionName}'`);
  }
  
  // Load documents for this collection
  loadCollectionDocuments(collectionName);
}

async function loadCollectionDocuments(collectionName, page = 1) {
  const container = document.getElementById('documentListContainer');
  const paginationContainer = document.getElementById('documentPaginationContainer');
  const refreshBtn = document.getElementById('btnRefreshDocuments');
  
  // Store current collection and page in state
  state.currentDocumentCollection = collectionName;
  state.currentDocumentPage = page;
  
  // Show refresh button
  if (refreshBtn) {
    refreshBtn.style.display = 'inline-flex';
  }
  
  // Show loading state
  container.innerHTML = '<div style="text-align: center; padding: 40px;"><div class="loading"></div><p style="margin-top: 12px; color: var(--text-secondary);">Loading documents...</p></div>';
  if (paginationContainer) {
    paginationContainer.innerHTML = '';
  }
  
  try {
    const connectionParams = getConnectionParams();
    if (state.connection.certPem) {
      connectionParams.certificatePem = state.connection.certPem;
    }
    
    const response = await fetch('/api/collections/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': state.connection.apiKey || ''
      },
      body: JSON.stringify({
        ...connectionParams,
        collectionName: collectionName,
        page: page,
        pageSize: 20
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to load documents');
    }
    
    const data = await response.json();
    const pagination = data.pagination;
    
    if (data.documents && data.documents.length > 0) {
      container.innerHTML = data.documents.map((doc, index) => `
        <div style="padding: 12px 20px; border-bottom: 1px solid var(--border); transition: background 0.2s;" 
             class="document-item"
             data-doc-id="${doc.id}"
             data-index="${index}"
             onmouseenter="this.style.background='var(--bg-hover)'" 
             onmouseleave="this.style.background='transparent'">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 10px; flex: 1; cursor: pointer;" class="doc-name-area">
              <span style="color: var(--text-secondary); font-size: 14px;">📄</span>
              <span style="font-size: 13px; color: var(--text-primary); font-family: 'Courier New', monospace;">${doc.id}</span>
            </div>
            <button class="btn-icon delete-doc-btn" 
                    data-doc-id="${doc.id}"
                    title="Delete document"
                    style="background: var(--danger); color: white; padding: 6px 10px; border-radius: 6px; font-size: 12px; border: none; cursor: pointer; transition: opacity 0.2s;"
                    onmouseenter="this.style.opacity='0.8'"
                    onmouseleave="this.style.opacity='1'">
              🗑️ Delete
            </button>
          </div>
        </div>
      `).join('');
      
      // Add click event listeners to document name areas
      const docNameAreas = container.querySelectorAll('.doc-name-area');
      docNameAreas.forEach(area => {
        area.addEventListener('click', () => {
          const docId = area.closest('.document-item').getAttribute('data-doc-id');
          openDocumentDetails(docId);
        });
      });
      
      // Add click event listeners to delete buttons
      const deleteButtons = container.querySelectorAll('.delete-doc-btn');
      deleteButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation(); // Prevent opening the document
          const docId = btn.getAttribute('data-doc-id');
          await deleteDocument(docId);
        });
      });
      
      // Show pagination controls
      if (paginationContainer && pagination.totalPages > 1) {
        const startDoc = ((page - 1) * pagination.pageSize) + 1;
        const endDoc = Math.min(page * pagination.pageSize, pagination.totalDocuments);
        
        paginationContainer.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-top: 1px solid var(--border); background: var(--bg-secondary);">
            <div style="font-size: 13px; color: var(--text-secondary);">
              Showing <strong style="color: var(--text-primary);">${startDoc}-${endDoc}</strong> of <strong style="color: var(--text-primary);">${pagination.totalDocuments}</strong> documents
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
              <button 
                id="btnPrevPage"
                ${!pagination.hasPreviousPage ? 'disabled' : ''}
                class="pagination-btn"
                style="padding: 8px 18px; background: ${pagination.hasPreviousPage ? 'var(--primary)' : 'var(--bg-card)'}; color: ${pagination.hasPreviousPage ? 'white' : 'var(--text-secondary)'}; border: 1px solid ${pagination.hasPreviousPage ? 'var(--primary)' : 'var(--border)'}; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: ${pagination.hasPreviousPage ? 'pointer' : 'not-allowed'}; transition: all 0.2s; box-shadow: ${pagination.hasPreviousPage ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'};">
                <span style="margin-right: 4px;">←</span> Previous
              </button>
              <span style="font-size: 13px; color: var(--text-secondary); padding: 0 12px; font-weight: 500;">
                Page <strong style="color: var(--primary); font-size: 14px;">${page}</strong> of <strong style="color: var(--text-primary);">${pagination.totalPages}</strong>
              </span>
              <button 
                id="btnNextPage"
                ${!pagination.hasNextPage ? 'disabled' : ''}
                class="pagination-btn"
                style="padding: 8px 18px; background: ${pagination.hasNextPage ? 'var(--primary)' : 'var(--bg-card)'}; color: ${pagination.hasNextPage ? 'white' : 'var(--text-secondary)'}; border: 1px solid ${pagination.hasNextPage ? 'var(--primary)' : 'var(--border)'}; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: ${pagination.hasNextPage ? 'pointer' : 'not-allowed'}; transition: all 0.2s; box-shadow: ${pagination.hasNextPage ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'};">
                Next <span style="margin-left: 4px;">→</span>
              </button>
            </div>
          </div>
        `;
        
        // Add event listeners for pagination buttons
        const btnPrev = document.getElementById('btnPrevPage');
        const btnNext = document.getElementById('btnNextPage');
        
        if (btnPrev && pagination.hasPreviousPage) {
          btnPrev.addEventListener('click', () => loadCollectionDocuments(collectionName, page - 1));
          btnPrev.addEventListener('mouseenter', (e) => {
            e.target.style.background = 'var(--primary-hover)';
            e.target.style.transform = 'translateY(-1px)';
            e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
          });
          btnPrev.addEventListener('mouseleave', (e) => {
            e.target.style.background = 'var(--primary)';
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          });
        }
        
        if (btnNext && pagination.hasNextPage) {
          btnNext.addEventListener('click', () => loadCollectionDocuments(collectionName, page + 1));
          btnNext.addEventListener('mouseenter', (e) => {
            e.target.style.background = 'var(--primary-hover)';
            e.target.style.transform = 'translateY(-1px)';
            e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
          });
          btnNext.addEventListener('mouseleave', (e) => {
            e.target.style.background = 'var(--primary)';
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          });
        }
      }
    } else {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--text-secondary);">
          <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.4;">📂</div>
          <h4 style="font-size: 14px; margin-bottom: 8px; color: var(--text-primary);">No Documents Found</h4>
          <p style="font-size: 13px;">This collection appears to be empty</p>
        </div>
      `;
    }
    
  } catch (error) {
    console.error('Error loading documents:', error);
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.4;">⚠️</div>
        <h4 style="font-size: 14px; margin-bottom: 8px; color: var(--danger);">Error Loading Documents</h4>
        <p style="font-size: 13px;">${error.message}</p>
      </div>
    `;
  }
}

// Document detail modal functions
let currentDocumentData = null;
let currentDocumentId = null;
let isEditMode = false;

async function openDocumentDetails(documentId) {
  currentDocumentId = documentId;
  isEditMode = false;
  const modal = document.getElementById('documentDetailModal');
  const titleEl = document.getElementById('docModalTitle');
  const contentEl = document.getElementById('documentDetailContent');
  
  // Show modal with loading state
  modal.classList.add('active');
  titleEl.textContent = documentId;
  contentEl.innerHTML = `
    <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
      <div class="loading"></div>
      <p style="margin-top: 12px;">Loading document...</p>
    </div>
  `;
  
  try {
    const connectionParams = getConnectionParams();
    if (state.connection.certPem) {
      connectionParams.certificatePem = state.connection.certPem;
    }
    
    const response = await fetch('/api/documents/get', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': state.connection.apiKey || ''
      },
      body: JSON.stringify({
        ...connectionParams,
        documentId: documentId
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to load document');
    }
    
    const data = await response.json();
    currentDocumentData = data.document;
    
    // Clean the document for display - remove 'id' field if it exists (RavenDB artifact)
    const displayData = { ...data.document };
    if (displayData['id'] && displayData['@metadata']) {
      // Only remove 'id' if we have @metadata (means it's a RavenDB internal field)
      delete displayData['id'];
    }
    
    // Display formatted JSON
    const formattedJson = JSON.stringify(displayData, null, 2);
    contentEl.innerHTML = `
      <pre style="margin: 0; font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.6; color: var(--text-primary); white-space: pre-wrap; word-wrap: break-word;">${syntaxHighlightJson(formattedJson)}</pre>
    `;
    
  } catch (error) {
    console.error('Error loading document:', error);
    contentEl.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.4;">⚠️</div>
        <h4 style="font-size: 14px; margin-bottom: 8px; color: var(--danger);">Error Loading Document</h4>
        <p style="font-size: 13px;">${error.message}</p>
      </div>
    `;
  }
}

function closeDocumentModal() {
  const modal = document.getElementById('documentDetailModal');
  modal.classList.remove('active');
  currentDocumentData = null;
  currentDocumentId = null;
  isEditMode = false;
  
  // Reset to view mode
  document.getElementById('documentViewMode').style.display = 'block';
  document.getElementById('documentEditMode').style.display = 'none';
  document.getElementById('btnEditDocument').style.display = 'inline-flex';
  document.getElementById('btnCloneDocument').style.display = 'inline-flex';
  document.getElementById('btnSaveDocument').style.display = 'none';
  document.getElementById('btnCancelEdit').style.display = 'none';
}

async function deleteDocument(documentId) {
  if (!confirm(`Are you sure you want to delete document:\n\n${documentId}\n\nThis action cannot be undone.`)) {
    return;
  }
  
  try {
    const connectionParams = getConnectionParams();
    if (state.connection.certPem) {
      connectionParams.certificatePem = state.connection.certPem;
    }
    
    const response = await fetch('/api/documents/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': state.connection.apiKey || ''
      },
      body: JSON.stringify({
        ...connectionParams,
        documentId: documentId
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete document');
    }
    
    const result = await response.json();
    
    showAlert(`✅ Document "${documentId}" deleted successfully!`, 'success');
    
    // Refresh the current collection view
    if (state.currentDocumentCollection) {
      const currentPage = state.currentDocumentPage || 1;
      await loadCollectionDocuments(state.currentDocumentCollection, currentPage);
    }
    
  } catch (error) {
    showAlert(`❌ Error deleting document: ${error.message}`, 'error');
    console.error('Delete error:', error);
  }
}

function toggleEditMode() {
  // Special case: if canceling a clone (no currentDocumentId), close modal instead
  if (isEditMode && currentDocumentId === null) {
    if (confirm('Cancel cloning this document? All changes will be lost.')) {
      closeDocumentModal();
    }
    return;
  }
  
  isEditMode = !isEditMode;
  
  const viewMode = document.getElementById('documentViewMode');
  const editMode = document.getElementById('documentEditMode');
  const editTextarea = document.getElementById('documentEditTextarea');
  const btnEdit = document.getElementById('btnEditDocument');
  const btnClone = document.getElementById('btnCloneDocument');
  const btnSave = document.getElementById('btnSaveDocument');
  const btnCancel = document.getElementById('btnCancelEdit');
  
  if (isEditMode) {
    // Switch to edit mode
    const jsonString = JSON.stringify(currentDocumentData, null, 2);
    editTextarea.value = jsonString;
    viewMode.style.display = 'none';
    editMode.style.display = 'block';
    btnEdit.style.display = 'none';
    btnClone.style.display = 'none';
    btnSave.style.display = 'inline-flex';
    btnCancel.style.display = 'inline-flex';
  } else {
    // Switch to view mode
    viewMode.style.display = 'block';
    editMode.style.display = 'none';
    btnEdit.style.display = 'inline-flex';
    btnClone.style.display = 'inline-flex';
    btnSave.style.display = 'none';
    btnCancel.style.display = 'none';
  }
}

async function saveDocumentChanges() {
  const editTextarea = document.getElementById('documentEditTextarea');
  
  try {
    // Validate JSON
    const updatedData = JSON.parse(editTextarea.value);
    
    // Determine if this is a new document (clone) or update
    const isNewDocument = currentDocumentId === null;
    
    // Save to RavenDB
    const connectionParams = getConnectionParams();
    if (state.connection.certPem) {
      connectionParams.certificatePem = state.connection.certPem;
    }
    
    const response = await fetch('/api/documents/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': state.connection.apiKey || ''
      },
      body: JSON.stringify({
        ...connectionParams,
        documentId: currentDocumentId,
        document: updatedData
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to save document');
    }
    
    const result = await response.json();
    
    console.log('💾 Save result:', result);
    
    if (isNewDocument) {
      showAlert(`✅ New document created successfully!\n\nDocument ID: ${result.documentId}\n\nRefreshing document list...`, 'success');
      
      // Update current document ID for reference
      currentDocumentId = result.documentId;
      
      // Close modal and refresh document list
      closeDocumentModal();
      
      // If we have a collection selected, refresh it
      if (state.currentDocumentCollection) {
        await refreshDocumentList();
      } else {
        // Extract collection name from document ID and reload it
        const collectionMatch = result.documentId.match(/^([^\/]+)\//);
        if (collectionMatch) {
          const collection = collectionMatch[1];
          console.log(`📂 Loading collection: ${collection}`);
          await loadCollectionDocuments(collection, 1);
        }
      }
    } else {
      showAlert('Document saved successfully!', 'success');
      
      // Reload document to show updated data
      await openDocumentDetails(currentDocumentId);
      
      // Reset to view mode after successful save
      const viewMode = document.getElementById('documentViewMode');
      const editMode = document.getElementById('documentEditMode');
      const btnEdit = document.getElementById('btnEditDocument');
      const btnSave = document.getElementById('btnSaveDocument');
      const btnCancel = document.getElementById('btnCancelEdit');
      
      viewMode.style.display = 'block';
      editMode.style.display = 'none';
      btnEdit.style.display = 'inline-flex';
      const btnClone = document.getElementById('btnCloneDocument');
      if (btnClone) btnClone.style.display = 'inline-flex';
      btnSave.style.display = 'none';
      btnCancel.style.display = 'none';
    }
    
  } catch (error) {
    if (error instanceof SyntaxError) {
      showAlert('Invalid JSON format. Please fix syntax errors.', 'error');
    } else {
      showAlert(`Error saving document: ${error.message}`, 'error');
    }
    console.error('Save error:', error);
  }
}

function cloneDocument() {
  if (!currentDocumentData) {
    showAlert('No document to clone', 'error');
    return;
  }
  
  try {
    // Create a deep copy of the current document
    const clonedData = JSON.parse(JSON.stringify(currentDocumentData));
    
    // Preserve collection information and original ID
    let collection = null;
    let originalDocId = null;
    if (clonedData['@metadata']) {
      if (clonedData['@metadata']['@collection']) {
        collection = clonedData['@metadata']['@collection'];
      }
      if (clonedData['@metadata']['@id']) {
        originalDocId = clonedData['@metadata']['@id'];
      }
      // Remove all RavenDB metadata
      delete clonedData['@metadata'];
    }
    
    // Remove the 'id' field that RavenDB might have added
    if (clonedData['id']) {
      delete clonedData['id'];
    }
    
    // Remove the 'Id' field - server will add it after document creation
    if (clonedData['Id']) {
      delete clonedData['Id'];
    }
    
    // Add back only the collection info so RavenDB knows where to store it
    // DO NOT include @id - server will auto-generate it
    if (collection) {
      clonedData['@metadata'] = {
        '@collection': collection
      };
    }
    
    // Clear the current document ID to indicate this is a new document
    const originalId = currentDocumentId;
    currentDocumentId = null;
    
    // Update the document data
    currentDocumentData = clonedData;
    
    // Switch to edit mode
    isEditMode = true;
    
    const viewMode = document.getElementById('documentViewMode');
    const editMode = document.getElementById('documentEditMode');
    const editTextarea = document.getElementById('documentEditTextarea');
    const btnEdit = document.getElementById('btnEditDocument');
    const btnClone = document.getElementById('btnCloneDocument');
    const btnSave = document.getElementById('btnSaveDocument');
    const btnCancel = document.getElementById('btnCancelEdit');
    
    // Populate edit textarea with cloned data
    const jsonString = JSON.stringify(clonedData, null, 2);
    editTextarea.value = jsonString;
    
    viewMode.style.display = 'none';
    editMode.style.display = 'block';
    btnEdit.style.display = 'none';
    btnClone.style.display = 'none';
    btnSave.style.display = 'inline-flex';
    btnCancel.style.display = 'inline-flex';
    
    // Update modal title
    document.getElementById('docModalTitle').textContent = `Clone Document (from ${originalId})`;
    
    showAlert('Document cloned! Edit and save to create a new document.', 'info');
    
  } catch (error) {
    showAlert(`Error cloning document: ${error.message}`, 'error');
    console.error('Clone error:', error);
  }
}

function copyDocumentToClipboard() {
  if (!currentDocumentData) return;
  
  const jsonString = JSON.stringify(currentDocumentData, null, 2);
  navigator.clipboard.writeText(jsonString).then(() => {
    showAlert('Document JSON copied to clipboard!', 'success');
  }).catch(err => {
    showAlert('Failed to copy to clipboard', 'error');
    console.error('Copy error:', err);
  });
}

// Initialize modal event listeners once DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initDocumentModalListeners();
    initEtlDetailsModalListeners();
  });
} else {
  initDocumentModalListeners();
  initEtlDetailsModalListeners();
}

function initDocumentModalListeners() {
  // Close buttons
  const btnCloseTop = document.getElementById('btnCloseDocModal');
  const btnCloseFooter = document.getElementById('btnCloseDocModalFooter');
  const btnEdit = document.getElementById('btnEditDocument');
  const btnClone = document.getElementById('btnCloneDocument');
  const btnSave = document.getElementById('btnSaveDocument');
  const btnCancel = document.getElementById('btnCancelEdit');
  const btnCopy = document.getElementById('btnCopyDocument');
  const btnRefresh = document.getElementById('btnRefreshDocuments');
  
  if (btnCloseTop) btnCloseTop.addEventListener('click', closeDocumentModal);
  if (btnCloseFooter) btnCloseFooter.addEventListener('click', closeDocumentModal);
  if (btnEdit) btnEdit.addEventListener('click', toggleEditMode);
  if (btnClone) btnClone.addEventListener('click', cloneDocument);
  if (btnSave) btnSave.addEventListener('click', saveDocumentChanges);
  if (btnCancel) btnCancel.addEventListener('click', toggleEditMode);
  if (btnCopy) btnCopy.addEventListener('click', copyDocumentToClipboard);
  if (btnRefresh) btnRefresh.addEventListener('click', refreshDocumentList);
  
  // Close on overlay click
  const modalOverlay = document.getElementById('documentDetailModal');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeDocumentModal();
      }
    });
  }
}

function initEtlDetailsModalListeners() {
  // Close buttons
  const btnCloseTop = document.getElementById('btnCloseEtlDetailsModal');
  const btnCloseFooter = document.getElementById('btnCloseEtlDetailsModalFooter');
  
  const closeModal = () => {
    document.getElementById('etlDetailsModal').classList.remove('active');
    
    // Dispose Monaco Editor instance
    if (state.modalEditor) {
      state.modalEditor.dispose();
      state.modalEditor = null;
    }
    
    // Clear the state to avoid stale data
    state.currentEtlDetails = null;
    state.currentTransformIndex = null;
    state.hasUnsavedChanges = false;
    
    // Clear the transformations list container
    const transformsList = document.getElementById('etlTransformationsList');
    if (transformsList) {
      transformsList.innerHTML = '';
    }
  };

  if (btnCloseTop) btnCloseTop.addEventListener('click', closeModal);
  if (btnCloseFooter) btnCloseFooter.addEventListener('click', closeModal);
  
  // Close on overlay click
  const modalOverlay = document.getElementById('etlDetailsModal');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });
  }
}

function refreshDocumentList() {
  if (state.currentDocumentCollection) {
    const currentPage = state.currentDocumentPage || 1;
    showAlert('Refreshing document list...', 'info');
    loadCollectionDocuments(state.currentDocumentCollection, currentPage);
  }
}

function syntaxHighlightJson(json) {
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|(\b(true|false|null)\b)|(-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'json-key';
        return '<span style="color: #60a5fa; font-weight: 500;">' + match + '</span>';
      } else {
        cls = 'json-string';
        return '<span style="color: #34d399;">' + match + '</span>';
      }
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
      return '<span style="color: #f59e0b; font-weight: 500;">' + match + '</span>';
    } else if (/null/.test(match)) {
      cls = 'json-null';
      return '<span style="color: #94a3b8; font-style: italic;">' + match + '</span>';
    }
    return '<span style="color: #e879f9;">' + match + '</span>';
  });
}

async function loadEtlTasks() {
  if (!state.connection.connected) {
    const container = document.getElementById('etlTasksList');
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
        <h3 style="font-size: 18px; margin-bottom: 8px; color: var(--text-primary);">Not Connected</h3>
        <p style="font-size: 14px;">Please connect to database first</p>
      </div>
    `;
    return;
  }
  
  const container = document.getElementById('etlTasksList');
  container.innerHTML = '<div style="text-align: center; padding: 40px;"><div class="loading"></div><p style="margin-top: 12px; color: var(--text-secondary);">Loading ETL tasks...</p></div>';
  
  try {
    const connectionParams = getConnectionParams();
    if (state.connection.certPem) {
      connectionParams.certificatePem = state.connection.certPem;
      connectionParams.certificatePath = '';
    }
    
    const data = await apiCall('/api/etl/list', 'POST', connectionParams);
    console.log('ETL Tasks:', data.tasks);
    renderEtlTasks(data.tasks);
    showAlert(`Loaded ${data.tasks.length} ETL task(s)`, 'success');
  } catch (error) {
    container.innerHTML = `<div class="empty-state">
      <svg fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>
      <h3 style="margin-bottom: 8px;">Failed to load ETL tasks</h3>
      <p>${error.message}</p>
    </div>`;
    showAlert(`Failed to load ETL tasks: ${error.message}`, 'error');
  }
}

function renderEtlTasks(tasks) {
  const container = document.getElementById('etlTasksList');
  
  if (!tasks || tasks.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <svg fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clip-rule="evenodd"/>
      </svg>
      <h3 style="margin-bottom: 8px;">No ETL Tasks Found</h3>
      <p>Create your first ETL transformation in the Editor tab</p>
    </div>`;
    return;
  }
  
  const tableHTML = `
    <table class="etl-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Connection String</th>
          <th>Collections</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${tasks.map(task => `
          <tr>
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 18px;">${task.type === 'RavenEtl' ? '📋' : '📦'}</span>
                <strong>${task.name}</strong>
              </div>
            </td>
            <td>
              <span class="etl-type-badge ${task.type === 'RavenEtl' ? 'etl-type-raven' : 'etl-type-olap'}">
                ${task.type === 'RavenEtl' ? 'RavenDB' : 'OLAP'}
              </span>
            </td>
            <td style="color: var(--text-secondary); font-size: 13px;">${task.connectionString || '<em>N/A</em>'}</td>
            <td style="color: var(--text-secondary); font-size: 13px;">${task.collections?.length ? task.collections.join(', ') : '<em>None</em>'}</td>
            <td>
              <span class="etl-status-badge ${task.disabled ? 'etl-status-disabled' : 'etl-status-active'}">
                ${task.disabled ? 'Disabled' : 'Enabled'}
              </span>
            </td>
            <td>
              <div class="etl-actions">
                <button class="btn-icon etl-edit-btn" data-etl-name="${task.name}" title="Edit ETL Task">
                  ✏️
                </button>
                <button class="btn-icon etl-run-btn" data-etl-name="${task.name}" data-etl-type="${task.type}" title="Reset ETL State" style="background: #007bff;">
                  🔄
                </button>
                <button class="btn-icon etl-delete-btn" data-etl-name="${task.name}" data-etl-type="${task.type}" title="Delete ETL Task">
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  container.innerHTML = tableHTML;
  
  // Add event listeners after rendering
  container.querySelectorAll('.etl-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const etlName = e.currentTarget.dataset.etlName;
      editEtlTask(etlName);
    });
  });
  
  container.querySelectorAll('.etl-run-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const etlName = e.currentTarget.dataset.etlName;
      const etlType = e.currentTarget.dataset.etlType;
      runEtlTaskFromList(etlName, etlType, e.currentTarget);
    });
  });
  
  container.querySelectorAll('.etl-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const etlName = e.currentTarget.dataset.etlName;
      const etlType = e.currentTarget.dataset.etlType;
      deleteEtlTask(etlName, etlType);
    });
  });
}

window.editEtlTask = async function(etlName) {
  try {
    // Validate connection
    if (!state.connection.connected || !state.connection.database) {
      showAlert('Please connect to RavenDB first', 'error');
      return;
    }

    // Fetch ETL details including script
    const response = await fetch('/api/etl/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: state.connection.url,
        database: state.connection.database,
        certificatePath: state.connection.certPath,
        certificatePem: state.connection.certPem,
        etlName: etlName
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch ETL details');
    }

    const etlData = await response.json();

    // Display ETL details in modal
    displayEtlDetailsModal(etlData);

  } catch (error) {
    console.error('Failed to load ETL:', error);
    showAlert(`Failed to load ETL: ${error.message}`, 'error');
  }
};

function displayEtlDetailsModal(etlData) {
  // Clear previous content first
  const transformsList = document.getElementById('etlTransformationsList');
  if (transformsList) {
    transformsList.innerHTML = '';
  }
  
  // Set basic info
  document.getElementById('etlDetailsTitle').textContent = `ETL Task: ${etlData.name}`;
  document.getElementById('etlDetailsName').textContent = etlData.name;
  document.getElementById('etlDetailsType').textContent = etlData.type;
  document.getElementById('etlDetailsConnectionString').textContent = etlData.connectionString || 'N/A';
  
  // Set status badge
  const statusElement = document.getElementById('etlDetailsStatus');
  if (etlData.disabled) {
    statusElement.innerHTML = '<span style="background: #dc3545; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600;">DISABLED</span>';
  } else {
    statusElement.innerHTML = '<span style="background: #28a745; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600;">ENABLED</span>';
  }

  // Build configuration section
  const configContent = document.getElementById('etlConfigContent');
  if (configContent) {
    let configHtml = '';
    
    // Task ID
    if (etlData.taskId !== undefined) {
      configHtml += `
        <div style="color: var(--text-secondary); font-weight: 500;">Task ID:</div>
        <div style="color: var(--text-primary); font-family: monospace; font-size: 13px;">${etlData.taskId}</div>
      `;
    }
    
    // Mentor Node
    if (etlData.mentorNode) {
      configHtml += `
        <div style="color: var(--text-secondary); font-weight: 500;">Mentor Node:</div>
        <div style="color: var(--text-primary); font-family: monospace; font-size: 13px;">${etlData.mentorNode}</div>
      `;
    }
    
    // Pinned
    if (etlData.pinned !== undefined) {
      const pinnedBadge = etlData.pinned 
        ? '<span style="background: #ffc107; color: #000; padding: 2px 8px; border-radius: 4px; font-size: 11px;">📌 PINNED</span>'
        : '<span style="color: var(--text-secondary); font-size: 13px;">Not pinned</span>';
      configHtml += `
        <div style="color: var(--text-secondary); font-weight: 500;">Pinned:</div>
        <div>${pinnedBadge}</div>
      `;
    }
    
    // Run Frequency (for OLAP ETL)
    if (etlData.type === 'OlapEtl' && etlData.configuration) {
      configHtml += `
        <div style="color: var(--text-secondary); font-weight: 500;">Run Frequency:</div>
        <div>
          <input 
            type="text" 
            id="etlRunFrequency" 
            value="${etlData.configuration.runFrequency || 'Not set'}" 
            style="background: var(--bg); color: var(--text-primary); border: 1px solid var(--border); padding: 6px 10px; border-radius: 4px; font-family: monospace; font-size: 13px; width: 300px;"
            placeholder="e.g., 0 */6 * * *"
          />
          <button id="btnUpdateRunFrequency" class="btn btn-primary" style="font-size: 12px; padding: 6px 12px; margin-left: 8px;">
            💾 Update
          </button>
        </div>
      `;
    }
    
    // Mentor Retention Time
    if (etlData.configuration && etlData.configuration.mentorRetentionTime) {
      configHtml += `
        <div style="color: var(--text-secondary); font-weight: 500;">Mentor Retention Time:</div>
        <div style="color: var(--text-primary); font-family: monospace; font-size: 13px;">${etlData.configuration.mentorRetentionTime}</div>
      `;
    }
    
    // Allow ETL on Non-Encrypted Channel
    if (etlData.allowEtlOnNonEncryptedChannel !== undefined) {
      const allowBadge = etlData.allowEtlOnNonEncryptedChannel
        ? '<span style="background: #dc3545; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">⚠️ ALLOWS UNENCRYPTED</span>'
        : '<span style="background: #28a745; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">🔒 ENCRYPTED ONLY</span>';
      configHtml += `
        <div style="color: var(--text-secondary); font-weight: 500;">Encryption:</div>
        <div>${allowBadge}</div>
      `;
    }
    
    // Add Run ETL Now button at the end
    configHtml += `
      <div style="color: var(--text-secondary); font-weight: 500;">Manual Execution:</div>
      <div>
        <button id="btnRunEtlNow" class="btn btn-primary" style="font-size: 13px; padding: 8px 16px; background: #007bff; font-weight: 600;">
          ▶️ Run ETL Now
        </button>
        <span style="color: var(--text-secondary); font-size: 11px; margin-left: 12px;">
          Forces the ETL to process immediately
        </span>
      </div>
    `;
    
    configContent.innerHTML = configHtml;
    
    // Add event listener for Update Run Frequency button
    const btnUpdateRunFrequency = document.getElementById('btnUpdateRunFrequency');
    if (btnUpdateRunFrequency) {
      btnUpdateRunFrequency.addEventListener('click', () => updateETLRunFrequency());
    }
    
    // Add event listener for Run ETL Now button
    const btnRunEtlNow = document.getElementById('btnRunEtlNow');
    if (btnRunEtlNow) {
      btnRunEtlNow.addEventListener('click', () => runETLNow());
    }
  }

  // Build transformations list
  // transformsList already declared above, just clear it again to be safe
  transformsList.innerHTML = '';

  if (etlData.transforms && etlData.transforms.length > 0) {
    // Create horizontal split layout
    const splitContainer = document.createElement('div');
    splitContainer.style.cssText = 'display: grid; grid-template-columns: 350px 1fr; gap: 20px; height: 100%; min-height: 500px;';
    
    // Left panel: List of transforms
    const leftPanel = document.createElement('div');
    leftPanel.style.cssText = 'border: 1px solid var(--border); border-radius: 8px; overflow-y: auto; background: var(--card-bg);';
    leftPanel.id = 'transforms-list-panel';
    
    // Right panel: Code viewer with Monaco Editor
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = 'border: 1px solid var(--border); border-radius: 8px; display: flex; flex-direction: column; background: var(--card-bg); overflow: hidden;';
    rightPanel.id = 'transform-code-panel';
    
    // Create header for code panel
    const codeHeader = document.createElement('div');
    codeHeader.id = 'transform-code-header';
    codeHeader.style.cssText = 'padding: 12px; border-bottom: 1px solid var(--border); background: var(--bg);';
    codeHeader.innerHTML = '<div style="color: var(--text-secondary); font-size: 14px;">⏳ Initializing editor...</div>';
    
    // Create Monaco Editor container
    const editorContainer = document.createElement('div');
    editorContainer.id = 'modal-editor-container';
    editorContainer.style.cssText = 'flex: 1; min-height: 400px; position: relative;';
    
    rightPanel.appendChild(codeHeader);
    rightPanel.appendChild(editorContainer);
    
    // Build transform list items
    etlData.transforms.forEach((transform, index) => {
      const collections = transform.collections.join(', ');
      const hasScript = transform.script && transform.script.trim().length > 0;
      const lineCount = transform.script ? transform.script.split('\n').length : 0;
      
      const transformItem = document.createElement('div');
      transformItem.id = `transform-item-${index}`;
      transformItem.className = 'transform-list-item';
      transformItem.style.cssText = `
        padding: 12px;
        cursor: wait;
        border-bottom: 1px solid var(--border);
        transition: all 0.2s ease;
        opacity: 0.5;
        ${index === 0 ? 'background: var(--accent); border-left: 3px solid var(--accent);' : 'border-left: 3px solid transparent;'}
      `;
      
      transformItem.innerHTML = `
        <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px; font-size: 14px;">
          ${transform.name}
        </div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">
          📦 ${collections || 'No collections'}
        </div>
        ${hasScript ? 
          `<div style="font-size: 11px; color: var(--success);">✓ ${lineCount} lines</div>` : 
          `<div style="font-size: 11px; color: var(--warning);">⚠ No script</div>`
        }
      `;
      
      // Add click handler - but only enable after editor is ready
      transformItem.dataset.transformIndex = index;
      transformItem.style.pointerEvents = 'none'; // Disable initially
      transformItem.addEventListener('click', () => {
        selectTransform(index);
      });
      
      leftPanel.appendChild(transformItem);
    });
    
    // Add panels to split container first
    splitContainer.appendChild(leftPanel);
    splitContainer.appendChild(rightPanel);
    transformsList.appendChild(splitContainer);
    
    // THEN initialize Monaco Editor and display first transform
    // This ensures the DOM elements exist and are rendered before creating the editor
    setTimeout(() => {
      initModalMonacoEditor().then(() => {
        // Enable all transform items now that editor is ready
        document.querySelectorAll('.transform-list-item').forEach(item => {
          item.style.pointerEvents = 'auto';
          item.style.cursor = 'pointer';
          item.style.opacity = '1';
        });
        console.log('✅ Editor ready, transform list enabled');
        updateCodePanel(0);
      }).catch(err => {
        console.error('Failed to initialize modal editor:', err);
        // Show error in header
        const header = document.getElementById('transform-code-header');
        if (header) {
          header.innerHTML = '<div style="color: #dc3545; font-size: 14px;">❌ Failed to initialize editor</div>';
        }
      });
    }, 250);
    
  } else {
    transformsList.innerHTML = '<div style="color: var(--text-secondary); padding: 20px; text-align: center; border: 1px dashed var(--border); border-radius: 8px;">No transformations defined</div>';
  }

  // Store ETL data in state for later use
  state.currentEtlDetails = etlData;

  // Show modal
  document.getElementById('etlDetailsModal').classList.add('active');
}

// Select a transform and update the code panel
function selectTransform(index) {
  if (!state.currentEtlDetails) return;
  
  // Update selected state in list
  const allItems = document.querySelectorAll('.transform-list-item');
  allItems.forEach((item, i) => {
    if (i === index) {
      item.style.background = 'var(--accent)';
      item.style.borderLeft = '3px solid var(--accent)';
    } else {
      item.style.background = 'transparent';
      item.style.borderLeft = '3px solid transparent';
    }
  });
  
  // Update code panel
  updateCodePanel(index);
}

// Initialize Monaco Editor instance for the modal
function initModalMonacoEditor() {
  return new Promise((resolve, reject) => {
    const container = document.getElementById('modal-editor-container');
    if (!container) {
      console.warn('Modal editor container not found');
      reject(new Error('Container not found'));
      return;
    }
    
    console.log('Modal editor container found:', container, 'Dimensions:', container.offsetWidth, 'x', container.offsetHeight);
    
    // If editor already exists, just resolve
    if (state.modalEditor) {
      console.log('Modal editor already initialized');
      resolve(state.modalEditor);
      return;
    }
    
    // Ensure Monaco is loaded
    if (typeof monaco === 'undefined') {
      console.error('Monaco Editor not loaded yet');
      reject(new Error('Monaco not loaded'));
      return;
    }
    
    try {
      state.modalEditor = monaco.editor.create(container, {
        value: '// Select a transformation to view its script',
        language: 'javascript',
        theme: 'vs-dark',
        readOnly: false,  // Allow editing
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineNumbers: 'on',
        renderWhitespace: 'selection',
        automaticLayout: false  // We'll call layout() manually
      });
      
      console.log('Modal Monaco Editor created successfully!');
      
      // Add content change listener to detect unsaved changes
      state.modalEditor.onDidChangeModelContent(() => {
        if (state.currentTransformIndex !== null) {
          state.hasUnsavedChanges = true;
          updateSaveButtonState();
        }
      });
      
      // Force initial layout and resolve
      setTimeout(() => {
        if (state.modalEditor) {
          state.modalEditor.layout();
          console.log('Modal Monaco Editor layout updated');
          resolve(state.modalEditor);
        } else {
          reject(new Error('Editor lost after creation'));
        }
      }, 50);
      
    } catch (error) {
      console.error('Error creating Modal Monaco Editor:', error);
      reject(error);
    }
  });
}

// Update the code panel with selected transform
function updateCodePanel(index) {
  if (!state.currentEtlDetails) return;
  
  const transform = state.currentEtlDetails.transforms[index];
  if (!transform) return;
  
  const codeHeader = document.getElementById('transform-code-header');
  
  // Safety check: if header doesn't exist, skip update
  if (!codeHeader) {
    console.warn('Code header not found, skipping update');
    return;
  }
  
  const hasScript = transform.script && transform.script.trim().length > 0;
  const collections = transform.collections.join(', ');
  const script = hasScript ? transform.script : '// No script defined for this transformation';
  
  // Store current transform index and reset unsaved changes
  state.currentTransformIndex = index;
  state.hasUnsavedChanges = false;
  
  // Update header with transform info and buttons
  codeHeader.innerHTML = `
    <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 8px; font-size: 15px;">
      ${transform.name}
    </div>
    <div style="display: flex; gap: 16px; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
      <div><strong>Collections:</strong> ${collections || 'None'}</div>
      <div><strong>All docs:</strong> ${transform.applyToAllDocuments ? 'Yes' : 'No'}</div>
      ${hasScript ? `<div style="color: var(--success);"><strong>Lines:</strong> ${transform.script.split('\n').length}</div>` : ''}
    </div>
    <div style="display: flex; gap: 8px;">
      <button class="btn btn-success" id="save-transform-btn" style="font-size: 12px; padding: 4px 12px;">
        💾 Save Changes
      </button>
      <button class="btn" id="copy-transform-btn" style="font-size: 12px; padding: 4px 12px;">
        📋 Copy
      </button>
    </div>
  `;
  
  // Update Monaco Editor content
  if (state.modalEditor) {
    console.log('Updating modal editor with transform:', transform.name);
    state.modalEditor.setValue(script);
    state.hasUnsavedChanges = false;
    
    // Force layout update to ensure proper rendering
    setTimeout(() => {
      if (state.modalEditor) {
        state.modalEditor.layout();
        console.log('Modal editor layout updated');
      }
      // Update button state after DOM is ready
      updateSaveButtonState();
    }, 50);
  } else {
    console.error('Modal editor is not initialized! Cannot display transform.');
  }
  
  // Add event listeners to buttons
  const saveBtn = document.getElementById('save-transform-btn');
  const copyBtn = document.getElementById('copy-transform-btn');
  
  if (saveBtn) {
    saveBtn.addEventListener('click', () => saveTransformChanges(index));
  }
  
  if (copyBtn) {
    copyBtn.addEventListener('click', () => copyTransformScript(index));
  }
}

// Copy transform script to clipboard
function copyTransformScript(index) {
  if (!state.currentEtlDetails) {
    showAlert('ETL data not available', 'error');
    return;
  }
  
  const transform = state.currentEtlDetails.transforms[index];
  if (!transform || !transform.script) {
    showAlert('No script to copy', 'warning');
    return;
  }
  
  navigator.clipboard.writeText(transform.script).then(() => {
    showAlert('Script copied to clipboard!', 'success');
  }).catch(err => {
    console.error('Copy error:', err);
    showAlert('Failed to copy script', 'error');
  });
}

// Save transform script changes
async function saveTransformChanges(index) {
  if (!state.currentEtlDetails) {
    showAlert('ETL data not available', 'error');
    return;
  }

  if (!state.modalEditor) {
    showAlert('Editor not initialized', 'error');
    return;
  }

  const transform = state.currentEtlDetails.transforms[index];
  if (!transform) {
    showAlert('Transform not found', 'error');
    return;
  }

  // Get current script from Monaco Editor
  const newScript = state.modalEditor.getValue();

  try {
    showAlert('Saving changes...', 'info');

    const response = await apiCall('/api/etl/update-transform', 'POST', {
      url: state.connection.url,
      database: state.connection.database,
      certificatePath: state.connection.certPath,
      certificatePem: state.connection.certPem,
      etlName: state.currentEtlDetails.name,
      etlType: state.currentEtlDetails.type,
      transformName: transform.name,
      newScript: newScript
    });

    if (response.success) {
      // Update local state
      state.currentEtlDetails.transforms[index].script = newScript;
      state.hasUnsavedChanges = false;
      
      showAlert('Transform script saved successfully!', 'success');
      
      // Update button state
      updateSaveButtonState();
      
      // Optionally refresh the ETL list
      setTimeout(() => {
        loadEtlTasks();
      }, 1000);
    } else {
      showAlert(`Failed to save: ${response.error}`, 'error');
    }
  } catch (error) {
    console.error('Error saving transform:', error);
    showAlert(`Error saving transform: ${error.message}`, 'error');
  }
}

// Update the save button visual state based on unsaved changes
function updateSaveButtonState() {
  const saveBtn = document.getElementById('save-transform-btn');
  if (!saveBtn) {
    console.log('Save button not found in DOM yet');
    return;
  }
  
  if (state.hasUnsavedChanges) {
    saveBtn.style.background = '#f39c12'; // Orange for unsaved changes
    saveBtn.style.fontWeight = 'bold';
    saveBtn.textContent = '💾 Save Changes *';
    saveBtn.title = 'You have unsaved changes';
  } else {
    saveBtn.style.background = ''; // Reset to default (green)
    saveBtn.style.fontWeight = '';
    saveBtn.textContent = '💾 Save Changes';
    saveBtn.title = 'No changes to save';
  }
}

// Update ETL Run Frequency
async function updateETLRunFrequency() {
  if (!state.currentEtlDetails) {
    showAlert('ETL data not available', 'error');
    return;
  }

  const runFrequencyInput = document.getElementById('etlRunFrequency');
  if (!runFrequencyInput) {
    showAlert('Run frequency input not found', 'error');
    return;
  }

  const newRunFrequency = runFrequencyInput.value.trim();
  
  if (!newRunFrequency) {
    showAlert('Please enter a valid run frequency (e.g., cron expression)', 'warning');
    return;
  }

  const btnUpdate = document.getElementById('btnUpdateRunFrequency');
  if (btnUpdate) {
    btnUpdate.disabled = true;
    btnUpdate.textContent = '⏳ Updating...';
  }

  try {
    const response = await apiCall('/api/etl/update-config', 'POST', {
      url: state.connection.url,
      database: state.connection.database,
      certificatePath: state.connection.certPath,
      certificatePem: state.connection.certPem,
      etlName: state.currentEtlDetails.name,
      etlType: state.currentEtlDetails.type,
      runFrequency: newRunFrequency
    });

    if (response.success) {
      // Update local state
      if (!state.currentEtlDetails.configuration) {
        state.currentEtlDetails.configuration = {};
      }
      state.currentEtlDetails.configuration.runFrequency = newRunFrequency;
      
      showAlert('Run frequency updated successfully!', 'success');
      
      // Refresh ETL list after a moment
      setTimeout(() => loadEtlTasks(), 1000);
    } else {
      showAlert(`Failed to update: ${response.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('Update run frequency error:', error);
    showAlert(`Error: ${error.message}`, 'error');
  } finally {
    if (btnUpdate) {
      btnUpdate.disabled = false;
      btnUpdate.textContent = '💾 Update';
    }
  }
}

// Reset ETL - Reset ETL state to trigger reprocessing
async function runETLNow() {
  if (!state.currentEtlDetails) {
    showAlert('ETL data not available', 'error');
    return;
  }

  if (!confirm(`Reset ETL "${state.currentEtlDetails.name}" state? This will reset the ETL progress and trigger reprocessing according to its schedule.`)) {
    return;
  }

  console.log('🔄 Triggering ETL execution:', {
    name: state.currentEtlDetails.name,
    type: state.currentEtlDetails.type,
    taskId: state.currentEtlDetails.taskId
  });

  const btnRunEtl = document.getElementById('btnRunEtlNow');
  if (btnRunEtl) {
    btnRunEtl.disabled = true;
    btnRunEtl.innerHTML = '⏳ Resetting...';
  }

  try {
    const connectionParams = getConnectionParams();
    if (state.connection.certPem) {
      connectionParams.certificatePem = state.connection.certPem;
      connectionParams.certificatePath = '';
    }
    
    const requestData = {
      ...connectionParams,
      etlName: state.currentEtlDetails.name,
      etlType: state.currentEtlDetails.type
    };
    
    console.log('📤 Sending run ETL request:', requestData);
    
    const response = await apiCall('/api/etl/run', 'POST', requestData);

    console.log('📥 Run ETL response:', response);

    if (response.warning && response.disabled) {
      showAlert(`⚠️ ${response.message}`, 'warning');
    } else if (response.success) {
      const infoMsg = response.info ? `\n\n${response.info}` : '';
      showAlert(`✅ ETL "${state.currentEtlDetails.name}" has been reset! Task ID: ${response.taskId}${infoMsg}`, 'success');
      
      // Refresh ETL list after a moment to see status changes
      setTimeout(() => loadEtlTasks(), 2000);
    } else {
      console.error('❌ Run ETL failed:', response);
      showAlert(`Failed to run ETL: ${response.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('💥 Run ETL error:', error);
    showAlert(`Error: ${error.message}`, 'error');
  } finally {
    if (btnRunEtl) {
      btnRunEtl.disabled = false;
      btnRunEtl.innerHTML = '🔄 Reset ETL State';
    }
  }
}

// Reset ETL from list - Reset ETL state from ETL Tasks table
async function runEtlTaskFromList(etlName, etlType, buttonElement) {
  if (!confirm(`Reset ETL "${etlName}" state? This will reset the ETL progress and trigger reprocessing according to its schedule.`)) {
    return;
  }

  // Validate connection
  if (!state.connection.connected || !state.connection.database) {
    showAlert('Please connect to RavenDB first', 'error');
    return;
  }

  console.log('🔄 Triggering ETL execution from list:', {
    name: etlName,
    type: etlType
  });

  const originalHTML = buttonElement.innerHTML;
  buttonElement.disabled = true;
  buttonElement.innerHTML = '⏳';

  try {
    const connectionParams = getConnectionParams();
    if (state.connection.certPem) {
      connectionParams.certificatePem = state.connection.certPem;
      connectionParams.certificatePath = '';
    }
    
    const requestData = {
      ...connectionParams,
      etlName: etlName,
      etlType: etlType
    };
    
    console.log('📤 Sending run ETL request:', requestData);
    
    const response = await apiCall('/api/etl/run', 'POST', requestData);

    console.log('📥 Run ETL response:', response);

    if (response.warning && response.disabled) {
      showAlert(`⚠️ ${response.message}`, 'warning');
    } else if (response.success) {
      const infoMsg = response.info ? `\n\n${response.info}` : '';
      showAlert(`✅ ETL "${etlName}" has been reset! Task ID: ${response.taskId}${infoMsg}`, 'success');
      
      // Refresh ETL list after a moment to see status changes
      setTimeout(() => loadEtlTasks(), 2000);
    } else {
      console.error('❌ Run ETL failed:', response);
      showAlert(`Failed to run ETL: ${response.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('💥 Run ETL from list error:', error);
    showAlert(`Error: ${error.message}`, 'error');
  } finally {
    buttonElement.disabled = false;
    buttonElement.innerHTML = originalHTML;
  }
}

// Edit transform script in main editor
// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.deleteEtlTask = async function(etlName, etlType) {
  if (!confirm(`⚠️ Are you sure you want to delete the ETL task "${etlName}"?\n\nThis action cannot be undone.`)) {
    return;
  }
  
  // Validate connection state before attempting delete
  if (!state.connection.connected || !state.connection.database) {
    showAlert('❌ Not connected to database. Please connect first in the sidebar.', 'error');
    
    // Switch to editor tab to show sidebar
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-tab="editor"]').classList.add('active');
    document.getElementById('editorView').style.display = 'block';
    document.getElementById('tasksView').style.display = 'none';
    
    return;
  }
  
  try {
    console.log('🗑️ Deleting ETL task:', etlName, 'Type:', etlType);
    
    const connectionParams = getConnectionParams();
    if (state.connection.certPem) {
      connectionParams.certificatePem = state.connection.certPem;
      connectionParams.certificatePath = '';
    }
    
    // Include taskType in the request body
    connectionParams.taskType = etlType;
    
    console.log('📤 Connection params for DELETE:', {
      url: connectionParams.url,
      database: connectionParams.database,
      taskType: connectionParams.taskType,
      hasCert: !!connectionParams.certificatePath || !!connectionParams.certificatePem
    });
    
    // RavenDB SDK uses DELETE method with name in URL
    const response = await fetch(`${API_BASE}/api/etl/${encodeURIComponent(etlName)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {})
      },
      body: JSON.stringify(connectionParams)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete ETL task');
    }
    
    showAlert(`✓ ETL task '${etlName}' deleted successfully`, 'success');
    console.log('✅ ETL task deleted:', etlName);
    
    // Reload the task list
    await loadEtlTasks();
    
  } catch (error) {
    console.error('❌ Delete ETL error:', error);
    showAlert(`Failed to delete ETL task: ${error.message}`, 'error');
  }
};

// ═══════════════════════════════════════════════════════════
// MODAL ETL CREATION
// ═══════════════════════════════════════════════════════════

let modalEditor = null;

function initModalCreationEditor() {
  if (modalEditor) return; // Already initialized
  
  const container = document.getElementById('modalMonacoEditor');
  if (!container) {
    console.error('Modal Monaco editor container not found!');
    return;
  }

  require(['vs/editor/editor.main'], function() {
    modalEditor = monaco.editor.create(container, {
      value: getDefaultTransformScript(),
      language: 'javascript',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
      tabSize: 2,
      formatOnPaste: true,
      formatOnType: true,
      scrollBeyondLastLine: false,
      lineNumbers: 'on',
      renderWhitespace: 'selection'
    });

    console.log('Modal Creation Editor created successfully!');
  });
}

function openEtlCreationModal() {
  const modal = document.getElementById('etlCreationModal');
  modal.classList.add('active');
  
  // Initialize modal editor if not done yet
  if (!modalEditor) {
    initModalCreationEditor();
  } else {
    // Force layout refresh
    setTimeout(() => {
      if (modalEditor) {
        modalEditor.layout();
      }
    }, 100);
  }
  
  // Load connection strings for modal
  loadConnectionStringsForModal();
  
  // Load collections into multi-select
  loadCollectionsForModal();
}

function loadConnectionStringsForModal() {
  const selector = document.getElementById('modalConnectionStringSelector');
  selector.innerHTML = '<option value="">-- Select connection string --</option>';
  
  state.connectionStrings.forEach(cs => {
    const option = document.createElement('option');
    option.value = cs.name;
    option.textContent = `${cs.name} (${cs.type}${cs.destination ? ': ' + cs.destination : ''})`;
    selector.appendChild(option);
  });
}

function loadCollectionsForModal() {
  const selector = document.getElementById('modalCollectionsSelector');
  selector.innerHTML = '';
  
  if (state.collections.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No collections loaded. Please connect and load collections first.';
    option.disabled = true;
    selector.appendChild(option);
    return;
  }
  
  state.collections.forEach(col => {
    const option = document.createElement('option');
    option.value = col.name;
    option.textContent = `${col.name} (${col.count} documents)`;
    
    // Pre-select collections that were added via "Add to ETL" button
    if (state.selectedCollections.includes(col.name)) {
      option.selected = true;
    }
    
    selector.appendChild(option);
  });
}

// ═══════════════════════════════════════════════════════════
// QUERY EDITOR FUNCTIONALITY
// ═══════════════════════════════════════════════════════════

function initializeQueryEditor() {
  require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
  
  require(['vs/editor/editor.main'], function () {
    state.queryEditor = monaco.editor.create(document.getElementById('queryEditor'), {
      value: `from '${state.currentCollectionView || 'Collection'}'`,
      language: 'sql',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      wordWrap: 'on'
    });
    
    console.log('✅ Query editor initialized');
  });
}

async function runCollectionQuery() {
  if (!state.queryEditor) {
    showAlert('Query editor not initialized', 'error');
    return;
  }
  
  const query = state.queryEditor.getValue();
  
  if (!query.trim()) {
    showAlert('Please enter a query', 'error');
    return;
  }
  
  console.log('🔍 Executing query:', query);
  
  const resultsContainer = document.getElementById('queryResultsContainer');
  resultsContainer.innerHTML = `
    <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
      <div class="loading"></div>
      <p style="margin-top: 12px;">Executing query...</p>
    </div>
  `;
  
  try {
    const connectionParams = getConnectionParams();
    if (state.connection.certPem) {
      connectionParams.certificatePem = state.connection.certPem;
    }
    
    const response = await fetch('/api/query/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': state.connection.apiKey || ''
      },
      body: JSON.stringify({
        ...connectionParams,
        query: query
      })
    });
    
    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Server returned invalid response. Please check server logs.');
    }
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to execute query');
    }
    
    const data = await response.json();
    displayQueryResults(data);
    showAlert(`Query executed successfully: ${data.totalResults} result(s) in ${data.durationInMs}ms`, 'success');
    
  } catch (error) {
    console.error('Query execution error:', error);
    let errorMessage = error.message;
    
    // Provide more helpful error messages
    if (errorMessage.includes('not valid JSON')) {
      errorMessage = 'Server error: Unable to connect to RavenDB. Please check your connection settings and try again.';
    }
    
    resultsContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.4;">⚠️</div>
        <h4 style="font-size: 14px; margin-bottom: 8px; color: var(--danger);">Query Error</h4>
        <p style="font-size: 13px; max-width: 500px; margin: 0 auto;">${errorMessage}</p>
      </div>
    `;
    showAlert(`Query error: ${errorMessage}`, 'error');
  }
}

function displayQueryResults(data) {
  const resultsContainer = document.getElementById('queryResultsContainer');
  
  if (!data.results || data.results.length === 0) {
    resultsContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.4;">📭</div>
        <h4 style="font-size: 14px; margin-bottom: 8px; color: var(--text-primary);">No Results</h4>
        <p style="font-size: 13px;">The query returned no results</p>
      </div>
    `;
    return;
  }
  
  // Get all unique keys from all results
  const allKeys = new Set();
  data.results.forEach(item => {
    Object.keys(item).forEach(key => allKeys.add(key));
  });
  const keys = Array.from(allKeys);
  
  // Build table HTML
  let html = `
    <div style="margin-bottom: 12px; color: var(--text-secondary); font-size: 13px;">
      <strong>${data.totalResults}</strong> result(s) in <strong>${data.durationInMs}ms</strong>
    </div>
    <div style="overflow-x: auto;">
      <table class="etl-table" style="margin: 0;">
        <thead>
          <tr>
            ${keys.map(key => `<th style="white-space: nowrap;">${key}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
  `;
  
  data.results.forEach(item => {
    html += '<tr>';
    keys.forEach(key => {
      const value = item[key];
      let displayValue;
      
      if (value === null || value === undefined) {
        displayValue = '<span style="color: var(--text-tertiary); font-style: italic;">null</span>';
      } else if (typeof value === 'object') {
        displayValue = `<span style="color: var(--text-secondary); font-size: 12px;">${JSON.stringify(value)}</span>`;
      } else if (typeof value === 'boolean') {
        displayValue = `<span style="color: ${value ? 'var(--success)' : 'var(--danger)'};">${value}</span>`;
      } else if (typeof value === 'number') {
        displayValue = `<span style="color: var(--primary); font-weight: 500;">${value.toLocaleString()}</span>`;
      } else {
        displayValue = String(value);
      }
      
      html += `<td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayValue}</td>`;
    });
    html += '</tr>';
  });
  
  html += `
        </tbody>
      </table>
    </div>
  `;
  
  resultsContainer.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

function initializeApp() {
  console.log('Initializing app...');
  initializeEventListeners();
  initMonacoEditor();
  updateConnectionStatus(false);
  
  // Show initial message in tasks view
  const etlTasksList = document.getElementById('etlTasksList');
  etlTasksList.innerHTML = `
    <div style="text-align: center; padding: 60px 20px; color: var(--text-secondary);">
      <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
      <h3 style="font-size: 18px; margin-bottom: 8px; color: var(--text-primary);">No ETL Tasks Yet</h3>
      <p style="font-size: 14px;">Connect to your RavenDB database to view and manage ETL tasks.</p>
    </div>
  `;
  
  // Try to restore previous session
  attemptAutoReconnect();
}

async function attemptAutoReconnect() {
  const session = loadSession();
  if (!session) {
    console.log('No saved session found');
    return;
  }
  
  console.log('🔄 Attempting to reconnect with saved session...');
  
  // Restore connection info to form
  document.getElementById('ravenUrl').value = session.url;
  document.getElementById('database').value = session.database;
  
  if (session.certPath) {
    document.getElementById('certPath').value = session.certPath;
  }
  
  // Restore to state
  state.connection.url = session.url;
  state.connection.database = session.database;
  state.connection.certPath = session.certPath;
  state.connection.certPem = session.certPem;
  
  // Show reconnecting message in tasks view
  const etlTasksList = document.getElementById('etlTasksList');
  etlTasksList.innerHTML = `
    <div style="text-align: center; padding: 60px 20px; color: var(--text-secondary);">
      <div style="font-size: 48px; margin-bottom: 16px;">🔄</div>
      <h3 style="font-size: 18px; margin-bottom: 8px; color: var(--text-primary);">Reconnecting...</h3>
      <p style="font-size: 14px;">Restoring your previous session.</p>
    </div>
  `;
  
  try {
    const connectionParams = getConnectionParams();
    if (session.certPem) {
      connectionParams.certificatePem = session.certPem;
      connectionParams.certificatePath = '';
    }
    
    await apiCall('/api/connect', 'POST', connectionParams);
    
    updateConnectionStatus(true);
    showAlert('✓ Session restored successfully', 'success');
    
    // Auto-load everything
    await loadCollections();
    await loadConnectionStrings();
    await loadEtlTasks();
    
  } catch (error) {
    console.error('Auto-reconnect failed:', error);
    updateConnectionStatus(false);
    clearSession();
    showAlert('Previous session expired. Please reconnect.', 'info');
    
    // Reset tasks view to initial state
    etlTasksList.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
        <h3 style="font-size: 18px; margin-bottom: 8px; color: var(--text-primary);">Session Expired</h3>
        <p style="font-size: 14px;">Please connect to your RavenDB database.</p>
      </div>
    `;
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOM already loaded
  initializeApp();
}
