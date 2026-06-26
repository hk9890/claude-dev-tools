# widget-service

REST API for widget inventory management.

## Installation

Download the latest release binary for your platform from the [releases page](https://github.com/acme/widget-service/releases).

```bash
curl -L https://github.com/acme/widget-service/releases/latest/download/widget-service-linux-amd64 -o widget-service
chmod +x widget-service
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `PORT` | `8080` | Port the server listens on |
| `LOG_LEVEL` | `info` | Log verbosity (`debug`, `info`, `warn`, `error`) |

## Usage

Start the server:

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/widgets ./widget-service
```

Create a widget:

```bash
curl -X POST http://localhost:8080/widgets \
  -H "Content-Type: application/json" \
  -d '{"name": "Sprocket", "quantity": 42}'
```

List widgets:

```bash
curl http://localhost:8080/widgets
```

Get a widget by ID:

```bash
curl http://localhost:8080/widgets/a1b2c3d4-...
```

Delete a widget:

```bash
curl -X DELETE http://localhost:8080/widgets/a1b2c3d4-...
```

## Building locally

To build and run the project from source, follow the steps in [docs/CODING.md](docs/CODING.md#building-from-source).
