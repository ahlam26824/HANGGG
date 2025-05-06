// Arduino/ESP8266 to Web Application bridge using WebSockets
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const fs = require('fs');

// Configure Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Serial port configuration
// Update with your Arduino port if still using Arduino Uno directly
const portName = process.env.ARDUINO_PORT || 'COM3';
let serialPort;
let connectedDevices = new Map(); // Track connected ESP8266 devices

try {
  // Try to connect to Arduino via Serial (optional if using ESP8266 only)
  serialPort = new SerialPort({
    path: portName,
    baudRate: 9600
  });

  // Create parser for reading line by line
  const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

  // Listen for data from Arduino
  parser.on('data', (data) => {
    console.log('Received from Arduino Serial:', data);
    
    // Parse the data (could be more complex based on your Arduino code)
    if (data.includes('MEDICATION_TAKEN')) {
      // Extract medication name if provided
      let medName = '';
      if (data.includes(':')) {
        medName = data.split(':')[1];
      }
      
      // Broadcast to all connected WebSocket clients
      broadcastMedicationTaken(medName);
    }
  });

  serialPort.on('error', (err) => {
    console.error('Serial port error:', err.message);
  });

} catch (err) {
  console.error('Failed to open serial port:', err.message);
  console.log('Running without Arduino Serial connection. Will still work with ESP8266 via WiFi');
}

// Function to broadcast medication taken event
function broadcastMedicationTaken(medicationName = '', deviceId = null) {
  const timestamp = new Date().toISOString();
  
  // Log the event
  logMedicationEvent({
    type: 'medication_taken', 
    medication: medicationName, 
    timestamp, 
    deviceId
  });
  
  // Broadcast to all connected WebSocket clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'medication_taken',
        medication: medicationName,
        timestamp,
        deviceId
      }));
    }
  });
}

// Log medication events to file
function logMedicationEvent(event) {
  const logEntry = JSON.stringify({
    ...event,
    serverTime: new Date().toISOString()
  });
  
  fs.appendFile('medication_logs.txt', logEntry + '\n', (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });
}

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`Client connected from ${clientIp}`);
  
  // Add client to device map with default name
  const deviceId = `client-${Date.now()}`;
  connectedDevices.set(ws, { deviceId, ip: clientIp, type: 'web' });
  
  // Send initial connection confirmation
  ws.send(JSON.stringify({
    type: 'connection_status',
    status: serialPort ? 'connected' : 'wifi_only',
    message: 'Connected to medication sensor server',
    devices: Array.from(connectedDevices.values())
  }));
  
  // Handle messages from clients
  ws.on('message', (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      console.log('Received from client:', parsedMessage);
      
      // Handle device identification
      if (parsedMessage.type === 'device_connected') {
        const deviceInfo = {
          deviceId: parsedMessage.device_id || `device-${Date.now()}`,
          ip: parsedMessage.ip || clientIp,
          type: 'esp8266',
          connectedAt: new Date().toISOString()
        };
        
        // Update device in map
        connectedDevices.set(ws, deviceInfo);
        
        // Notify all clients of the new device
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'device_update',
              devices: Array.from(connectedDevices.values())
            }));
          }
        });
        
        console.log(`Device registered: ${deviceInfo.deviceId} at ${deviceInfo.ip}`);
      }
      
      // Handle medication taken message from ESP8266
      if (parsedMessage.type === 'medication_taken') {
        const deviceInfo = connectedDevices.get(ws);
        broadcastMedicationTaken(parsedMessage.medication || '', deviceInfo?.deviceId);
      }
      
      // Handle simulation
      if (parsedMessage.type === 'simulation') {
        broadcastMedicationTaken(parsedMessage.medication || '', 'simulation');
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    const deviceInfo = connectedDevices.get(ws);
    if (deviceInfo) {
      console.log(`Device disconnected: ${deviceInfo.deviceId}`);
      connectedDevices.delete(ws);
      
      // Notify remaining clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'device_update',
            devices: Array.from(connectedDevices.values())
          }));
        }
      });
    }
  });
});

// HTTP endpoint for status check
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    arduino: serialPort ? 'connected' : 'disconnected',
    serverTime: new Date().toISOString(),
    connectedDevices: Array.from(connectedDevices.values())
  });
});

// Add endpoint to get medication logs
app.get('/logs', (req, res) => {
  fs.readFile('medication_logs.txt', 'utf8', (err, data) => {
    if (err) {
      // If file doesn't exist or other error
      res.json({ logs: [] });
      return;
    }
    
    // Parse logs from file
    const logs = data.split('\n')
      .filter(line => line.trim() !== '')
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(entry => entry !== null);
    
    res.json({ logs });
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
  console.log(`Arduino ${serialPort ? 'connected' : 'not connected'} at ${portName}`);
}); 