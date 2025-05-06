package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/tarm/serial"
)

// Configuration
const (
	SerialPort     = "COM3" // Update with your Arduino port if using Arduino Uno
	SerialBaudRate = 9600
	WebPort        = 3000
	LogFile        = "medication_logs.txt"
)

// Device represents a connected hardware device or web client
type Device struct {
	DeviceID    string    `json:"deviceId"`
	IP          string    `json:"ip"`
	Type        string    `json:"type"`
	ConnectedAt time.Time `json:"connectedAt"`
}

// MedicationEvent represents a medication taken event
type MedicationEvent struct {
	Type        string    `json:"type"`
	Medication  string    `json:"medication"`
	Timestamp   time.Time `json:"timestamp"`
	DeviceID    string    `json:"deviceId,omitempty"`
	ServerTime  time.Time `json:"serverTime"`
}

// WebSocketMessage represents a message sent over WebSocket
type WebSocketMessage struct {
	Type        string      `json:"type"`
	Medication  string      `json:"medication,omitempty"`
	Timestamp   string      `json:"timestamp,omitempty"`
	DeviceID    string      `json:"deviceId,omitempty"`
	Status      string      `json:"status,omitempty"`
	Message     string      `json:"message,omitempty"`
	Devices     interface{} `json:"devices,omitempty"`
	IP          string      `json:"ip,omitempty"`
	SimulatedBy string      `json:"simulatedBy,omitempty"`
}

var (
	// WebSocket connection upgrader
	upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow connections from any origin
		},
	}

	// Connected clients and devices
	clients        = make(map[*websocket.Conn]bool)
	devices        = make(map[*websocket.Conn]*Device)
	clientsMutex   = &sync.Mutex{}
	serialConn     *serial.Port
	hasSerialPort  = false
)

func main() {
	// Initialize serial connection if using Arduino
	initSerial()

	// Serve static files from current directory
	fs := http.FileServer(http.Dir("."))
	http.Handle("/", fs)

	// WebSocket handler
	http.HandleFunc("/ws", handleWebSocket)

	// API endpoints
	http.HandleFunc("/status", handleStatus)
	http.HandleFunc("/logs", handleLogs)

	// Start the server
	log.Printf("Starting server on http://localhost:%d", WebPort)
	log.Printf("WebSocket server running on ws://localhost:%d/ws", WebPort)
	log.Printf("Arduino %s at %s", map[bool]string{true: "connected", false: "not connected"}[hasSerialPort], SerialPort)
	
	// Listen on the specified port
	if err := http.ListenAndServe(fmt.Sprintf(":%d", WebPort), nil); err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}

// Initialize serial connection for Arduino Uno
func initSerial() {
	// Configure serial port
	c := &serial.Config{
		Name:        SerialPort,
		Baud:        SerialBaudRate,
		ReadTimeout: time.Second * 5,
	}

	// Try to open the serial port
	var err error
	serialConn, err = serial.OpenPort(c)
	if err != nil {
		log.Println("Failed to open serial port:", err)
		log.Println("Running without Arduino Serial connection. Will still work with ESP8266 via WiFi")
		return
	}

	hasSerialPort = true
	log.Println("Serial port connected successfully")

	// Start reading from serial port in a goroutine
	go readSerial()
}

// Read data from the serial port
func readSerial() {
	buf := make([]byte, 128)
	
	for {
		if !hasSerialPort || serialConn == nil {
			time.Sleep(time.Second)
			continue
		}
		
		n, err := serialConn.Read(buf)
		if err != nil {
			log.Println("Error reading from serial port:", err)
			time.Sleep(time.Second)
			continue
		}
		
		if n > 0 {
			data := string(buf[:n])
			log.Println("Received from Arduino Serial:", data)
			
			// Check for MEDICATION_TAKEN event
			if contains(data, "MEDICATION_TAKEN") {
				medName := ""
				// Extract medication name if provided
				if contains(data, ":") {
					parts := splitString(data, ":")
					if len(parts) > 1 {
						medName = parts[1]
					}
				}
				
				// Broadcast to all clients
				broadcastMedicationTaken(medName, "arduino")
			}
		}
	}
}

// Handle WebSocket connections
func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}
	
	// Get client IP
	clientIP := r.RemoteAddr
	log.Printf("Client connected from %s", clientIP)
	
	// Register new client
	clientsMutex.Lock()
	clients[conn] = true
	
	// Add client to device map with default name
	deviceID := fmt.Sprintf("client-%d", time.Now().Unix())
	devices[conn] = &Device{
		DeviceID:    deviceID,
		IP:          clientIP,
		Type:        "web",
		ConnectedAt: time.Now(),
	}
	clientsMutex.Unlock()
	
	// Send initial connection confirmation
	status := "wifi_only"
	if hasSerialPort {
		status = "connected"
	}
	
	message := WebSocketMessage{
		Type:    "connection_status",
		Status:  status,
		Message: "Connected to medication sensor server",
		Devices: getDevicesList(),
	}
	
	err = conn.WriteJSON(message)
	if err != nil {
		log.Println("Write error:", err)
		conn.Close()
		return
	}
	
	// Start listening for messages from this client
	go handleClientMessages(conn)
}

// Handle messages from a client
func handleClientMessages(conn *websocket.Conn) {
	defer func() {
		clientsMutex.Lock()
		// Get device info before deleting
		deviceInfo := devices[conn]
		
		// Remove client from maps
		delete(clients, conn)
		delete(devices, conn)
		clientsMutex.Unlock()
		
		conn.Close()
		
		if deviceInfo != nil {
			log.Printf("Device disconnected: %s", deviceInfo.DeviceID)
			
			// Notify remaining clients about device disconnection
			broadcastDeviceUpdate()
		}
	}()
	
	for {
		// Read message
		var msg WebSocketMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}
		
		log.Printf("Received from client: %+v", msg)
		
		// Handle different message types
		switch msg.Type {
		case "device_connected":
			// Handle device identification
			clientsMutex.Lock()
			deviceID := msg.DeviceID
			if deviceID == "" {
				deviceID = fmt.Sprintf("device-%d", time.Now().Unix())
			}
			
			ip := msg.IP
			if ip == "" {
				ip = devices[conn].IP
			}
			
			// Update device info
			devices[conn] = &Device{
				DeviceID:    deviceID,
				IP:          ip,
				Type:        "esp8266",
				ConnectedAt: time.Now(),
			}
			clientsMutex.Unlock()
			
			log.Printf("Device registered: %s at %s", deviceID, ip)
			
			// Notify all clients of the new device
			broadcastDeviceUpdate()
			
		case "medication_taken":
			// Handle medication taken message from ESP8266
			clientsMutex.Lock()
			deviceInfo := devices[conn]
			clientsMutex.Unlock()
			
			var deviceID string
			if deviceInfo != nil {
				deviceID = deviceInfo.DeviceID
			}
			
			broadcastMedicationTaken(msg.Medication, deviceID)
			
		case "simulation":
			// Handle simulation
			broadcastMedicationTaken(msg.Medication, "simulation")
		}
	}
}

// Broadcast medication taken event to all clients
func broadcastMedicationTaken(medicationName string, deviceID string) {
	timestamp := time.Now()
	
	// Log the event
	event := MedicationEvent{
		Type:       "medication_taken",
		Medication: medicationName,
		Timestamp:  timestamp,
		DeviceID:   deviceID,
		ServerTime: timestamp,
	}
	logMedicationEvent(event)
	
	// Broadcast to all connected clients
	message := WebSocketMessage{
		Type:       "medication_taken",
		Medication: medicationName,
		Timestamp:  timestamp.Format(time.RFC3339),
		DeviceID:   deviceID,
	}
	
	broadcastMessage(message)
}

// Broadcast device update to all clients
func broadcastDeviceUpdate() {
	message := WebSocketMessage{
		Type:    "device_update",
		Devices: getDevicesList(),
	}
	
	broadcastMessage(message)
}

// Broadcast a message to all connected clients
func broadcastMessage(message WebSocketMessage) {
	clientsMutex.Lock()
	defer clientsMutex.Unlock()
	
	for client := range clients {
		err := client.WriteJSON(message)
		if err != nil {
			log.Printf("Error broadcasting to client: %v", err)
			client.Close()
			delete(clients, client)
			delete(devices, client)
		}
	}
}

// Get a list of connected devices
func getDevicesList() []Device {
	clientsMutex.Lock()
	defer clientsMutex.Unlock()
	
	devicesList := make([]Device, 0, len(devices))
	for _, device := range devices {
		devicesList = append(devicesList, *device)
	}
	
	return devicesList
}

// Handle status API endpoint
func handleStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	status := map[string]interface{}{
		"status":           "online",
		"arduino":          map[bool]string{true: "connected", false: "disconnected"}[hasSerialPort],
		"serverTime":       time.Now().Format(time.RFC3339),
		"connectedDevices": getDevicesList(),
	}
	
	json.NewEncoder(w).Encode(status)
}

// Handle logs API endpoint
func handleLogs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	logs, err := readLogFile()
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"logs": []interface{}{},
		})
		return
	}
	
	json.NewEncoder(w).Encode(map[string]interface{}{
		"logs": logs,
	})
}

// Read medication logs from file
func readLogFile() ([]MedicationEvent, error) {
	// Check if log file exists
	if _, err := os.Stat(LogFile); os.IsNotExist(err) {
		return []MedicationEvent{}, nil
	}
	
	// Read file content
	data, err := os.ReadFile(LogFile)
	if err != nil {
		return nil, err
	}
	
	// Parse logs
	lines := splitLines(string(data))
	logs := make([]MedicationEvent, 0, len(lines))
	
	for _, line := range lines {
		if line == "" {
			continue
		}
		
		var event MedicationEvent
		err := json.Unmarshal([]byte(line), &event)
		if err == nil {
			logs = append(logs, event)
		}
	}
	
	return logs, nil
}

// Log a medication event to file
func logMedicationEvent(event MedicationEvent) {
	// Ensure directory exists
	dir := filepath.Dir(LogFile)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		os.MkdirAll(dir, 0755)
	}
	
	// Marshal to JSON
	data, err := json.Marshal(event)
	if err != nil {
		log.Println("Error marshaling event:", err)
		return
	}
	
	// Append to log file
	f, err := os.OpenFile(LogFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Println("Error opening log file:", err)
		return
	}
	defer f.Close()
	
	if _, err := f.WriteString(string(data) + "\n"); err != nil {
		log.Println("Error writing to log file:", err)
	}
}

// Helper function to check if a string contains a substring
func contains(s, substr string) bool {
	for i := 0; i < len(s); i++ {
		if i+len(substr) <= len(s) && s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// Helper function to split a string by a delimiter
func splitString(s, delim string) []string {
	var result []string
	start := 0
	
	for i := 0; i < len(s); i++ {
		if i+len(delim) <= len(s) && s[i:i+len(delim)] == delim {
			result = append(result, s[start:i])
			start = i + len(delim)
			i += len(delim) - 1
		}
	}
	
	if start < len(s) {
		result = append(result, s[start:])
	}
	
	return result
}

// Helper function to split a string into lines
func splitLines(s string) []string {
	var lines []string
	line := ""
	
	for _, r := range s {
		if r == '\n' {
			lines = append(lines, line)
			line = ""
		} else {
			line += string(r)
		}
	}
	
	if line != "" {
		lines = append(lines, line)
	}
	
	return lines
} 