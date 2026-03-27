# Changelog

All notable changes to DataLoom ETL Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-03-26

### Added
- **Connection Strings Management Tab**: New dedicated tab for managing RavenDB and OLAP connection strings
- **Auto-test on Creation**: Connection strings automatically validated after creation
- **Manual Connection Testing**: New 🧪 test button for testing existing connection strings
- **Reset ETL State**: New 🔄 button to reset ETL state and trigger reprocessing
- **Warning Alerts**: Yellow/orange alerts for partial failures and warnings
- **Enhanced Error Messages**: More descriptive error messages with context

### Changed
- **Button Naming**: "Run ETL Now" renamed to "Reset ETL State" for accuracy
- **ETL Execution Behavior**: Clarified that OLAP ETLs run on schedule, not immediately
- **Confirmation Dialogs**: Simplified multiline messages to single-line format
- **Test Endpoint**: Switched from `GetConnectionStringsOperation` to `GetDatabaseRecordOperation` for reliability

### Fixed
- **Certificate Parameters**: Fixed undefined certificate parameters breaking ETL execution
- **Connection String Property**: Changed `containerName` to `storageContainer` for Azure ADLS
- **Cancel Button**: Fixed non-responsive Cancel button in connection string modal
- **Event Listeners**: Removed inline onclick handlers, added proper event listeners

### Technical
- Improved connection parameter handling with `getConnectionParams()` helper
- Added conditional certificate inclusion to prevent undefined values
- Enhanced backend logging for ETL operations
- Added disabled state detection for ETL tasks

## [1.1.0] - 2026-02-15

### Added
- **ETL Task Management**: Full CRUD operations for RavenDB and OLAP ETL tasks
- **Monaco Editor Integration**: VSCode-like code editing experience
- **Collection Browser**: Visual selector with document counts
- **Certificate Authentication**: Support for PEM and PFX certificates
- **Connection Pooling**: Efficient reuse of database connections

### Changed
- Redesigned UI with dark sidebar and modern color palette
- Improved error handling across all API endpoints

### Fixed
- Memory leaks in connection pool management
- Race conditions in ETL task updates

## [1.0.0] - 2026-01-10

### Added
- Initial release of DataLoom ETL Manager
- Basic ETL task creation and management
- RavenDB connection with certificate authentication
- Simple transformation script editor
- ETL task listing and deletion

### Security
- API key authentication middleware
- Helmet.js CSP headers
- Express rate limiting (100 req/15min)
- CORS configuration

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.2.0 | 2026-03-26 | Connection strings management & ETL reset |
| 1.1.0 | 2026-02-15 | Monaco Editor & collection browser |
| 1.0.0 | 2026-01-10 | Initial release |

---

For detailed commit history, see [GitHub Commits](https://github.com/yourusername/dataloom-etl-manager/commits/main)
