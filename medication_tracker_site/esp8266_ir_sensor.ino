/*
  Medication Tracker - ESP8266 + IR Sensor
  
  This sketch uses an ESP8266 NodeMCU and IR sensor to detect when medication is taken
  and sends the information directly to the web server via WiFi.
  
  Hardware:
  - ESP8266 NodeMCU
  - IR obstacle avoidance sensor
  - Optional LED for visual feedback
*/

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";      // Replace with your WiFi network name
const char* password = "YOUR_WIFI_PASSWORD"; // Replace with your WiFi password

// WebSocket Configuration
const char* websocket_server = "192.168.1.100"; // Replace with your server IP
const int websocket_port = 3000;             // Same port as in server.go
const char* websocket_url = "/ws";          // WebSocket path for Go server

// Pin definitions
const int irSensorPin = D2;    // Digital pin for IR sensor (D2 on NodeMCU)
const int ledPin = D4;         // Built-in LED on NodeMCU (D4/GPIO2)

// Variables
bool medicationTaken = false;
unsigned long lastTriggerTime = 0;
const unsigned long debounceDelay = 1000; // Debounce time in milliseconds
bool isConnected = false;                // WebSocket connection status

WebSocketsClient webSocket;

void setup() {
  // Initialize serial communication
  Serial.begin(115200);
  Serial.println("\nMedication Tracker ESP8266 Starting...");
  
  // Configure pins
  pinMode(irSensorPin, INPUT);
  pinMode(ledPin, OUTPUT);
  
  // Initial LED state
  digitalWrite(ledPin, HIGH); // LED is active LOW on NodeMCU
  
  // Connect to WiFi
  connectWiFi();
  
  // Initialize WebSocket connection
  initWebSocket();
}

void loop() {
  // Keep the WebSocket connection alive
  webSocket.loop();
  
  // Check WiFi connection and reconnect if needed
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi connection lost. Reconnecting...");
    connectWiFi();
  }
  
  // Read the IR sensor state
  int sensorState = digitalRead(irSensorPin);
  
  // IR sensors typically output LOW when object is detected
  // Adjust the logic below if your sensor works differently
  if (sensorState == LOW) {
    // Object detected - medication taken
    if (!medicationTaken && (millis() - lastTriggerTime > debounceDelay)) {
      medicationTaken = true;
      lastTriggerTime = millis();
      
      // Turn on LED for visual feedback (active LOW on NodeMCU)
      digitalWrite(ledPin, LOW);
      
      // Send message via WebSocket
      sendMedicationTaken();
      
      Serial.println("Medication taken detected!");
    }
  } else {
    // No object detected, reset state after short delay
    if (medicationTaken && (millis() - lastTriggerTime > debounceDelay)) {
      medicationTaken = false;
      digitalWrite(ledPin, HIGH); // Turn off LED (active LOW on NodeMCU)
    }
  }
  
  // Small delay to avoid flooding
  delay(100);
}

// Connect to WiFi network
void connectWiFi() {
  Serial.print("Connecting to WiFi network: ");
  Serial.println(ssid);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  // Wait for connection with timeout
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("WiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("");
    Serial.println("WiFi connection failed. Will retry later.");
  }
}

// Initialize WebSocket connection
void initWebSocket() {
  Serial.println("Initializing WebSocket connection...");
  
  // Server address, port, URL
  webSocket.begin(websocket_server, websocket_port, websocket_url);
  
  // Event handler
  webSocket.onEvent(webSocketEvent);
  
  // Try often until connected
  webSocket.setReconnectInterval(5000);
  
  // Start connection
  Serial.println("WebSocket initialized");
}

// Handle WebSocket events
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("WebSocket disconnected");
      isConnected = false;
      break;
      
    case WStype_CONNECTED:
      Serial.println("WebSocket connected");
      isConnected = true;
      // Send identification message
      identifyDevice();
      break;
      
    case WStype_TEXT:
      Serial.println("Received WebSocket message:");
      Serial.println((char*)payload);
      break;
      
    case WStype_ERROR:
      Serial.println("WebSocket error");
      break;
      
    default:
      break;
  }
}

// Send medication taken message
void sendMedicationTaken() {
  if (isConnected) {
    // Create JSON document
    StaticJsonDocument<200> doc;
    doc["type"] = "medication_taken";
    doc["device_id"] = "ESP8266_IR_Sensor";
    doc["timestamp"] = millis();
    
    // Serialize JSON to string
    String message;
    serializeJson(doc, message);
    
    // Send message
    webSocket.sendTXT(message);
    Serial.println("Sent medication taken message: " + message);
  } else {
    Serial.println("WebSocket not connected. Cannot send message.");
  }
}

// Send device identification
void identifyDevice() {
  // Create JSON document
  StaticJsonDocument<200> doc;
  doc["type"] = "device_connected";
  doc["device_id"] = "ESP8266_IR_Sensor";
  doc["ip"] = WiFi.localIP().toString();
  
  // Serialize JSON to string
  String message;
  serializeJson(doc, message);
  
  // Send message
  webSocket.sendTXT(message);
  Serial.println("Sent identification message: " + message);
} 