/*
  Medication Tracker - IR Sensor
  
  This sketch uses an IR sensor to detect when medication is taken
  and sends the information to a web server.
  
  Hardware:
  - Arduino Uno
  - IR obstacle avoidance sensor
  - Optional LED for visual feedback
*/

// Pin definitions
const int irSensorPin = 2;    // Digital pin for IR sensor
const int ledPin = 13;        // Built-in LED for visual feedback

// Variables
bool medicationTaken = false;
unsigned long lastTriggerTime = 0;
const unsigned long debounceDelay = 1000; // Debounce time in milliseconds

void setup() {
  // Initialize serial communication
  Serial.begin(9600);
  
  // Configure pins
  pinMode(irSensorPin, INPUT);
  pinMode(ledPin, OUTPUT);
  
  // Initial LED state
  digitalWrite(ledPin, LOW);
  
  Serial.println("IR Medication Sensor Ready");
}

void loop() {
  // Read the IR sensor state
  int sensorState = digitalRead(irSensorPin);
  
  // IR sensors typically output LOW when object is detected
  // Adjust the logic below if your sensor works differently
  if (sensorState == LOW) {
    // Object detected - medication taken
    if (!medicationTaken && (millis() - lastTriggerTime > debounceDelay)) {
      medicationTaken = true;
      lastTriggerTime = millis();
      
      // Turn on LED for visual feedback
      digitalWrite(ledPin, HIGH);
      
      // Send a message via Serial that can be captured by a SerialPort listener
      Serial.println("MEDICATION_TAKEN");
      
      // Add medication name if multiple medications are being tracked
      // Serial.println("MEDICATION_TAKEN:MedName");
    }
  } else {
    // No object detected, reset state after short delay
    if (medicationTaken && (millis() - lastTriggerTime > debounceDelay)) {
      medicationTaken = false;
      digitalWrite(ledPin, LOW);
    }
  }
  
  // Small delay to avoid flooding the serial port
  delay(100);
} 