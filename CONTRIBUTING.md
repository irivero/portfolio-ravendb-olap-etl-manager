# Contributing to DataLoom ETL Manager

Thank you for your interest in contributing to DataLoom! This document provides guidelines for contributing to the project.

## 🔐 Project Access

DataLoom is a **private project** for the OPPRA organization. Contributions are limited to authorized OPPRA team members.

## 📋 Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing Guidelines](#testing-guidelines)
- [Commit Message Convention](#commit-message-convention)
- [Pull Request Process](#pull-request-process)

## 🚀 Getting Started

### Prerequisites

- Node.js 18.0+
- Access to OPPRA RavenDB instance
- Valid client certificate
- Git configured with OPPRA credentials

### Setup Development Environment

```bash
# Clone repository
git clone https://github.com/oppra/dataloom-etl-manager.git
cd dataloom-etl-manager/etl-manager

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Add your dev certificate to certs/
cp /path/to/dev-cert.pem certs/

# Start in development mode
npm run dev
```

## 🔄 Development Workflow

1. **Pick a task** from JIRA (OPPRA-ETL project)
2. **Create a branch** from `main`
   ```bash
   git checkout -b feature/OPPRA-123-short-description
   git checkout -b fix/OPPRA-456-bug-description
   git checkout -b docs/update-api-documentation
   ```

3. **Make your changes** following code style guidelines
4. **Test thoroughly** (see Testing Guidelines)
5. **Commit** with descriptive messages
6. **Push** and create Pull Request
7. **Request review** from at least one team member
8. **Address feedback** if any
9. **Merge** after approval

## 💻 Code Style Guidelines

### General Principles

- **English Only**: All code, comments, and documentation in English
- **Senior Engineering Standards**: Code should reflect 30+ years of practical experience
- **Readability First**: Code is read more than written
- **SOLID Principles**: Follow Single Responsibility, Open/Closed, etc.
- **DRY**: Don't Repeat Yourself - extract reusable functions

### JavaScript/Node.js

**Formatting**:
```javascript
// Good ✅
async function getEtlTasks(database, certificatePath) {
  try {
    const store = getOrCreateStore({ url, database, certificatePath });
    const operation = new GetEtlTasksOperation();
    const result = await store.maintenance.send(operation);
    return result;
  } catch (error) {
    console.error('❌ Failed to get ETL tasks:', error);
    throw error;
  }
}

// Bad ❌
function getEtlTasks(database,certificatePath){
const store=getOrCreateStore({url,database,certificatePath})
const operation=new GetEtlTasksOperation()
const result=store.maintenance.send(operation)
return result
}
```

**Naming Conventions**:
- `camelCase` for variables and functions: `etlTaskList`, `createConnectionString()`
- `PascalCase` for classes: `DocumentStore`, `RavenEtlConfiguration`
- `UPPER_SNAKE_CASE` for constants: `MAX_CONNECTIONS`, `DEFAULT_TIMEOUT`
- Descriptive names: `isConnectionValid` not `check`, `getUserById` not `get`

**Error Handling**:
```javascript
// Good ✅
try {
  const result = await apiCall('/api/etl/create', 'POST', data);
  if (!result.success) {
    throw new Error(result.error || 'Operation failed');
  }
  return result.data;
} catch (error) {
  console.error('Failed to create ETL:', error);
  showAlert(`Error: ${error.message}`, 'error');
  throw error; // Re-throw if caller needs to handle
}

// Bad ❌
apiCall('/api/etl/create', 'POST', data)
  .then(result => result.data)
  .catch(err => console.log(err));
```

**Async/Await**:
- Always use `async/await` over `.then()` chains
- Handle errors explicitly with try/catch
- Never create unhandled promise rejections

### HTML/CSS

**HTML Structure**:
```html
<!-- Good ✅ -->
<div class="etl-task-card" data-etl-id="task-123">
  <h3 class="etl-task-name">Customer ETL</h3>
  <p class="etl-task-status">Active</p>
  <button class="btn btn-primary" onclick="editTask('task-123')">
    Edit
  </button>
</div>

<!-- Bad ❌ -->
<div class=container>
<h3>Customer ETL
<p>Active
<button onclick=editTask(task-123)>Edit
```

**CSS**:
- Use CSS variables for colors
- Mobile-first responsive design
- Semantic class names: `.etl-task-status` not `.blue-text`

## 🧪 Testing Guidelines

### Manual Testing Checklist

Before submitting a PR, test:

**Connection Flow**:
- [ ] Connect with PEM certificate
- [ ] Connect with PFX certificate
- [ ] Connect with cert content (paste)
- [ ] Reconnect after disconnect
- [ ] Connection error handling

**ETL Operations**:
- [ ] Create RavenDB ETL
- [ ] Create OLAP ETL
- [ ] Edit transformation script
- [ ] Update ETL configuration
- [ ] Reset ETL state
- [ ] Delete ETL task

**Connection Strings**:
- [ ] Create RavenDB connection string
- [ ] Create OLAP connection string
- [ ] Auto-test on creation
- [ ] Manual test with 🧪 button
- [ ] Delete connection string

**Error Scenarios**:
- [ ] Invalid certificate
- [ ] Wrong database name
- [ ] Network timeout
- [ ] Invalid transformation script
- [ ] Deleted connection string reference

### Browser Testing

Test on:
- Chrome (primary)
- Edge
- Firefox
- Safari (if available)

## 📝 Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring (no feature or bug fix)
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

**Examples**:
```bash
feat(connection-strings): add auto-test on creation

Automatically validates connection strings after creation using
the new test endpoint (/api/connection-strings/test).

Closes OPPRA-234

---

fix(etl): resolve undefined certificate parameter

ETL execution was failing due to undefined certificatePem being
passed to RavenDB SDK. Now uses conditional inclusion.

Fixes OPPRA-456

---

docs(readme): update deployment section

Added Docker and Azure App Service deployment examples.
```

## 🔀 Pull Request Process

1. **Update Documentation**: If you add/change features, update README.md
2. **Update Changelog**: Add entry to CHANGELOG.md under Unreleased
3. **Self-Review**: Review your own code before requesting review
4. **PR Description**: Use the template below

### PR Template

```markdown
## Description
Brief description of changes

## JIRA Ticket
[OPPRA-123](https://oppra.atlassian.net/browse/OPPRA-123)

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing Done
- [ ] Manual testing completed
- [ ] Tested on multiple browsers
- [ ] Error scenarios covered

## Screenshots (if applicable)
Add screenshots showing UI changes

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-reviewed code
- [ ] Commented complex logic
- [ ] Updated documentation
- [ ] No console errors
- [ ] Tested connection with certificates
```

3. **Request Review**: Tag at least one team member
4. **Address Feedback**: Make changes if requested
5. **Merge**: After approval, merge using "Squash and merge"

## 🐛 Bug Reports

When reporting bugs:

1. **Search existing issues** in JIRA first
2. **Provide details**:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Browser/OS
   - RavenDB version
   - Screenshots/logs
3. **Label appropriately**: bug, critical, etc.

## 💡 Feature Requests

For new features:

1. **Discuss in Slack** (#dataloom-dev) first
2. **Create JIRA ticket** with:
   - Use case / business value
   - Proposed solution
   - Alternative approaches
   - Impact on existing features
3. **Wait for approval** before implementing

## 📞 Questions?

- **Slack**: #dataloom-dev channel
- **Email**: dataloom-team@oppra.com
- **Wiki**: [OPPRA Confluence - DataLoom](https://oppra.atlassian.net/wiki/dataloom)

---

Thank you for contributing to DataLoom! 🧵✨
