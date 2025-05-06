# Go Server for Medication Tracker

This is a Go-based server implementation for the Medication Tracker application with ESP8266 and IR sensor integration.

## Prerequisites

- [Go](https://golang.org/dl/) 1.18 or later
- ESP8266 NodeMCU with IR sensor (see `ESP8266_SETUP.md` for hardware setup)

## Installation

1. Install Go from [golang.org](https://golang.org/dl/)
2. Clone or download this repository
3. Open a terminal in the repository directory

## Running the Server

### Windows

Double-click the `build.bat` file or run it from the command prompt:

```cmd
build.bat
```

### macOS/Linux

Make the script executable and run it:

```bash
chmod +x run.sh
./run.sh
```

### Manual Build and Run

If you prefer to build and run manually:

```bash
# Install dependencies
go mod tidy

# Build
go build -o medication_tracker server.go

# Run
./medication_tracker  # On macOS/Linux
medication_tracker.exe  # On Windows
```

## Configuration

The server configuration is at the top of `server.go`:

```go
// Configuration
const (
    SerialPort     = "COM3" // Update with your Arduino port if using Arduino Uno
    SerialBaudRate = 9600
    WebPort        = 3000
    LogFile        = "medication_logs.txt"
)
```

Modify these values as needed:

- `SerialPort`: Set to your Arduino port (e.g., "COM3" on Windows, "/dev/ttyACM0" on Linux, "/dev/cu.usbmodem1101" on macOS)
- `WebPort`: The HTTP/WebSocket port (default: 3000)
- `LogFile`: Where medication events are logged

## Connecting with ESP8266

To connect your ESP8266 to this server:

1. Ensure your ESP8266 is programmed with the code in `esp8266_ir_sensor.ino`
2. Update the WebSocket server settings in the ESP8266 code:

```cpp
// WebSocket Configuration
const char* websocket_server = "192.168.1.100"; // Replace with your server's IP
const int websocket_port = 3000;
const char* websocket_url = "/ws";  // Use "/ws" as the path
```

3. Make sure your ESP8266 and the computer running this server are on the same network

## API Endpoints

The server provides the following endpoints:

- `GET /`: Serves the web application
- `GET /status`: Returns server status info
- `GET /logs`: Returns medication logs history
- `WebSocket /ws`: WebSocket connection for real-time communication

## Troubleshooting

### WebSocket Connection Issues

If the ESP8266 cannot connect to the server:

1. Check the server's IP address is correct in ESP8266 code
2. Verify both devices are on the same network
3. Check if there's a firewall blocking port 3000
4. Try running `ping [server-ip]` from another computer to verify connectivity

### Arduino Serial Port Not Found

If the server cannot connect to the Arduino:

1. Verify the Arduino is connected to your computer
2. Check the correct port is specified in the configuration
3. Make sure the Arduino is not being used by another application

Note: The server will still work with ESP8266 devices even if no Arduino is connected.

## Advanced Usage

### Running as a System Service

#### Windows

1. Create a Windows service using [NSSM](https://nssm.cc/):
   ```
   nssm install MedicationTrackerService [path\to\medication_tracker.exe]
   ```

2. Set the service to start automatically:
   ```
   nssm set MedicationTrackerService Start SERVICE_AUTO_START
   ```

#### Linux (systemd)

1. Create a service file at `/etc/systemd/system/medication-tracker.service`:
   ```
   [Unit]
   Description=Medication Tracker Server
   After=network.target

   [Service]
   ExecStart=/path/to/medication_tracker
   WorkingDirectory=/path/to/server/directory
   Restart=always
   User=yourusername

   [Install]
   WantedBy=multi-user.target
   ```

2. Enable and start the service:
   ```
   sudo systemctl enable medication-tracker.service
   sudo systemctl start medication-tracker.service
   ``` 