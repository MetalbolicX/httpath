# HTTPath Architecture Overview

This document provides a comprehensive overview of HTTPath's modular architecture, explaining the design decisions, component interactions, and extensibility features.

## 🏗️ Architecture Philosophy

HTTPath follows a **modular, separation-of-concerns architecture** that prioritizes:

- **Maintainability**: Each module has a single, well-defined responsibility
- **Testability**: Components can be tested in isolation
- **Extensibility**: New features can be added without affecting existing code
- **Type Safety**: Full TypeScript support with strict type checking
- **Performance**: Efficient resource usage and streaming capabilities

## 📁 Project Structure

```
src/
├── index.mts                 # Main entry point and orchestration
├── types/
│   └── index.mts            # TypeScript type definitions
├── config/
│   └── cli.mts              # CLI argument parsing and configuration
├── constants/
│   └── mime-types.mts       # MIME type mappings and utilities
├── security/
│   └── path-validator.mts   # Path validation and security middleware
├── services/
│   ├── file-service.mts     # File system operations and directory listing
│   ├── hot-reload.mts       # Hot-reload functionality with SSE
│   └── server.mts           # HTTP server and request handling
└── utils/
    ├── logger.mts           # Logging utilities and request logging
    └── port-finder.mts      # Port availability checking
```

## 🧩 Component Overview

### Core Components

#### 1. **Main Entry Point** (`index.mts`)
- **Purpose**: Application orchestration and lifecycle management
- **Responsibilities**:
  - CLI argument parsing
  - Configuration validation
  - Server initialization
  - Graceful shutdown handling
  - Error management

#### 2. **Type Definitions** (`types/index.mts`)
- **Purpose**: Centralized TypeScript type definitions
- **Key Types**:
  - `ServerConfig`: Server configuration interface
  - `HttpRequest`/`HttpResponse`: Enhanced HTTP types
  - `FileEntry`: File system entry representation
  - `SSEClient`: Server-Sent Events client interface
  - `LogEntry`: Structured logging interface

### Configuration Layer

#### 3. **CLI Configuration** (`config/cli.mts`)
- **Purpose**: Command-line interface and configuration management
- **Features**:
  - Argument parsing with `util.parseArgs`
  - Environment variable support
  - Configuration validation
  - Help and version display
  - Default value management

#### 4. **MIME Types** (`constants/mime-types.mts`)
- **Purpose**: Content-type detection and file classification
- **Features**:
  - 40+ file extension mappings
  - Binary vs. text file detection
  - Compressible content identification
  - Custom MIME type registry
  - File categorization utilities

### Security Layer

#### 5. **Path Validator** (`security/path-validator.mts`)
- **Purpose**: Security-first path validation and sanitization
- **Security Features**:
  - Directory traversal prevention
  - Path normalization
  - Blocked pattern detection
  - Protected directory access control
  - Security audit logging
  - Input sanitization

### Service Layer

#### 6. **File Service** (`services/file-service.mts`)
- **Purpose**: File system operations and directory rendering
- **Capabilities**:
  - Asynchronous file operations
  - Responsive directory listing generation
  - File metadata extraction
  - Streaming vs. buffering decisions
  - Template-based HTML rendering
  - Error handling and fallbacks

#### 7. **Hot-Reload Service** (`services/hot-reload.mts`)
- **Purpose**: Real-time file change detection and browser communication
- **Technical Implementation**:
  - `fs.watch` for file monitoring
  - Server-Sent Events (SSE) for browser communication
  - Client connection management
  - Debounced change detection
  - Automatic script injection
  - Reconnection logic

#### 8. **HTTP Server** (`services/server.mts`)
- **Purpose**: HTTP request handling and response generation
- **Core Features**:
  - Request routing and middleware
  - Security integration
  - File serving optimization
  - Error response generation
  - Graceful shutdown handling
  - Performance monitoring

### Utility Layer

#### 9. **Logger** (`utils/logger.mts`)
- **Purpose**: Structured logging and performance monitoring
- **Features**:
  - Multiple log levels (debug, info, warn, error)
  - Colorized console output
  - Request/response logging
  - Performance timing
  - Configurable formatting
  - TTY detection

#### 10. **Port Finder** (`utils/port-finder.mts`)
- **Purpose**: Network port management and availability checking
- **Capabilities**:
  - Asynchronous port testing
  - Range-based port scanning
  - Multiple port allocation
  - Smart port suggestions
  - Retry logic with backoff
  - Common port range definitions

## 🔄 Data Flow Architecture

### Request Processing Pipeline

```
HTTP Request
    ↓
[Security Validation]
    ↓
[Path Resolution]
    ↓
[File System Check]
    ↓
┌─ Directory ──→ [Directory Listing] ──→ [HTML Generation]
│                                            ↓
└─ File ──────→ [MIME Detection] ──→ [Content Serving]
                                            ↓
[Hot-Reload Injection] (if enabled)
    ↓
HTTP Response
```

### Hot-Reload Event Flow

```
File Change Event
    ↓
[Debounce Processing]
    ↓
[Change Detection]
    ↓
[Client Notification]
    ↓
┌─ SSE Message ──→ [Browser Clients]
│                        ↓
└─ WebSocket Alternative  [Page Reload]
```

## 🔧 Design Patterns

### 1. **Factory Pattern**
- Used in service creation (`createHTTPServer`, `createLogger`)
- Allows for configuration-based instantiation
- Enables dependency injection

### 2. **Observer Pattern**
- Hot-reload service uses EventEmitter
- Decoupled file change notifications
- Extensible event handling

### 3. **Strategy Pattern**
- File serving strategies (streaming vs. buffering)
- Different MIME type handling approaches
- Configurable security policies

### 4. **Middleware Pattern**
- Request processing pipeline
- Pluggable security validators
- Composable request handlers

### 5. **Singleton Pattern**
- Global logger instance
- Configuration management
- Server state management

## 🚀 Performance Optimizations

### Memory Management
- **Stream-based file serving**: Prevents loading large files into memory
- **Debounced file watching**: Reduces CPU usage during rapid changes
- **Connection pooling**: Efficient SSE client management
- **Lazy loading**: Modules loaded on-demand

### Network Efficiency
- **Content-Length headers**: Proper HTTP semantics
- **Cache headers**: Browser caching optimization
- **Compression hints**: Indicates compressible content
- **Keep-alive connections**: Reduced connection overhead

### CPU Optimization
- **Asynchronous I/O**: Non-blocking file operations
- **Worker delegation**: Heavy operations in separate processes
- **Smart caching**: Frequently accessed data cached
- **Efficient parsing**: Optimized URL and path processing

## 🔒 Security Architecture

### Defense in Depth

1. **Input Validation**
   - URL decoding and normalization
   - Path length limits
   - Character filtering

2. **Path Security**
   - Directory traversal prevention
   - Symbolic link resolution
   - Root boundary enforcement

3. **Access Control**
   - File permission checking
   - Protected directory blocking
   - Hidden file filtering

4. **Audit Trail**
   - Security violation logging
   - Access attempt tracking
   - Error condition monitoring

## 🧪 Testing Strategy

### Unit Testing
- Individual module testing
- Mock-based dependency isolation
- Type safety validation
- Error condition coverage

### Integration Testing
- Service interaction verification
- End-to-end request processing
- Security boundary testing
- Performance benchmarking

### System Testing
- Multi-platform compatibility
- Resource usage validation
- Stress testing scenarios
- Recovery testing

## 🔌 Extensibility Points

### Plugin Architecture
- **Service Plugins**: Custom file processors
- **Middleware Plugins**: Request/response modification
- **Authentication Plugins**: User access control
- **Logging Plugins**: Custom log destinations

### Configuration Extensions
- **Custom MIME Types**: Application-specific mappings
- **Security Policies**: Flexible access rules
- **Template Themes**: Customizable directory listings
- **Hot-Reload Filters**: Selective file watching

### API Extensions
- **RESTful Endpoints**: Programmatic server control
- **WebSocket Support**: Real-time communication
- **GraphQL Interface**: Flexible data querying
- **Metrics API**: Performance monitoring

## 📊 Monitoring and Observability

### Logging Levels
- **Debug**: Detailed execution flow
- **Info**: Normal operations
- **Warn**: Recoverable issues
- **Error**: Failure conditions

### Performance Metrics
- **Request latency**: Response time tracking
- **Throughput**: Requests per second
- **Resource usage**: Memory and CPU utilization
- **Connection counts**: Active client tracking

### Health Checks
- **Service availability**: Server responsiveness
- **File system access**: Directory permissions
- **Network connectivity**: Port availability
- **Hot-reload status**: Client connection health

## 🔄 Deployment Considerations

### Build Process
- **TypeScript compilation**: Type-safe JavaScript output
- **Module bundling**: Optimized distribution packages
- **Tree shaking**: Unused code elimination
- **Minification**: Reduced file sizes

### Runtime Environment
- **Node.js compatibility**: Version requirements
- **Operating system support**: Cross-platform operation
- **File system permissions**: Access requirements
- **Network configuration**: Port and firewall settings

### Scaling Options
- **Horizontal scaling**: Multiple server instances
- **Load balancing**: Traffic distribution
- **Reverse proxy integration**: Production deployment
- **Container orchestration**: Docker and Kubernetes support

## 📈 Future Enhancements

### Planned Features
- **HTTP/2 support**: Modern protocol implementation
- **WebSocket integration**: Real-time bidirectional communication
- **Content compression**: Gzip and Brotli encoding
- **Static asset optimization**: CSS/JS minification
- **Database integration**: Metadata storage and indexing

### Architecture Evolution
- **Microservices decomposition**: Service separation
- **Event sourcing**: State change tracking
- **CQRS implementation**: Command/query separation
- **API versioning**: Backward compatibility management

---

This architecture provides a solid foundation for a production-ready file server while maintaining simplicity and extensibility. The modular design ensures that HTTPath can evolve to meet future requirements without compromising its core reliability and performance characteristics.