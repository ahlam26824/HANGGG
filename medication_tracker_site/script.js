// DOM Elements
document.addEventListener('DOMContentLoaded', function() {
  // Initialize app when DOM is loaded
  initApp();
  
  // Initialize Arduino WebSocket connection
  initArduinoConnection();
});

// Global variables
let medications = [];
let activeTheme = 'blue';
let nextMedicationTimeout;
let reminderCountdownInterval;
let activeReminders = new Set(); // Track active reminders to prevent duplicates
let minReminderDuration = 120; // Minimum popup duration in seconds (2 minutes)
let arduinoSocket; // WebSocket connection to Arduino server
let isArduinoConnected = false;
let connectedDevices = []; // List of connected hardware devices

// Initialize WebSocket connection to server
function initArduinoConnection() {
  // Connect to the WebSocket server
  const host = window.location.hostname;
  const wsUrl = `ws://${host}:3000/ws`; // Update for Go server WebSocket path
  
  console.log(`Connecting to WebSocket at ${wsUrl}`);
  arduinoSocket = new WebSocket(wsUrl);
  
  // Connection opened
  arduinoSocket.addEventListener('open', (event) => {
    console.log('Connected to Arduino/ESP8266 WebSocket server');
    isArduinoConnected = true;
  });
  
  // Listen for messages from server
  arduinoSocket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('Message from server:', data);
      
      // Handle medication taken event
      if (data.type === 'medication_taken') {
        handleMedicationTakenEvent(data);
      }
      
      // Handle connection status updates
      if (data.type === 'connection_status') {
        showArduinoStatus(data.status === 'connected' || data.status === 'wifi_only', data.devices || []);
      }
      
      // Handle device updates
      if (data.type === 'device_update') {
        connectedDevices = data.devices || [];
        updateDevicesList();
      }
    } catch (e) {
      console.error('Error parsing WebSocket message:', e);
    }
  });
  
  // Connection closed
  arduinoSocket.addEventListener('close', (event) => {
    console.log('Disconnected from WebSocket server');
    showArduinoStatus(false);
    isArduinoConnected = false;
    
    // Try to reconnect after 5 seconds
    setTimeout(initArduinoConnection, 5000);
  });
  
  // Connection error
  arduinoSocket.addEventListener('error', (event) => {
    console.error('WebSocket error:', event);
    showArduinoStatus(false);
    isArduinoConnected = false;
  });
}

// Show Arduino connection status in the UI
function showArduinoStatus(isConnected, devices = []) {
  // Check if status element exists, if not create it
  let statusElement = document.getElementById('arduinoStatus');
  
  if (!statusElement) {
    statusElement = document.createElement('div');
    statusElement.id = 'arduinoStatus';
    statusElement.className = 'arduino-status';
    
    // Add it to the header
    document.querySelector('header').appendChild(statusElement);
  }
  
  // Update connected devices
  connectedDevices = devices;
  
  // Update status display
  if (isConnected) {
    // If we have ESP8266 devices connected
    if (devices && devices.length > 0) {
      const espDevices = devices.filter(d => d.type === 'esp8266');
      if (espDevices.length > 0) {
        statusElement.innerHTML = `<i class="fas fa-wifi"></i> ESP8266 Connected (${espDevices.length})`;
        statusElement.classList.remove('disconnected');
        statusElement.classList.add('connected');
        return;
      }
    }
    
    // Default to Arduino status
    statusElement.innerHTML = '<i class="fas fa-wifi"></i> IR Sensor Connected';
    statusElement.classList.remove('disconnected');
    statusElement.classList.add('connected');
  } else {
    statusElement.innerHTML = '<i class="fas fa-wifi"></i> Sensors Disconnected';
    statusElement.classList.remove('connected');
    statusElement.classList.add('disconnected');
  }
}

// Handle a medication taken event from Arduino
function handleMedicationTakenEvent(data) {
  // If specific medication is identified in the data, mark that one as taken
  if (data.medication && data.medication.trim() !== '') {
    const medToMark = medications.find(med => 
      med.name.toLowerCase() === data.medication.toLowerCase()
    );
    
    if (medToMark) {
      markSpecificMedicationAsTaken(medToMark.id);
      return;
    }
  }
  
  // Otherwise mark the next scheduled medication as taken
  const nextMed = getNextMedication();
  if (nextMed) {
    // If there's an active reminder, take this medication
    if (activeReminders.has(nextMed.id + '_take')) {
      markMedicationAsTaken('ir_sensor');
    } else {
      // Show a notification about medication being taken
      showNotification('Medication detected by IR sensor!', 'info');
      
      // Mark as taken automatically if next dose is within 15 minutes
      const timeDiff = nextMed.nextDose - new Date();
      if (Math.abs(timeDiff) <= 15 * 60 * 1000) { // 15 minutes in milliseconds
        markMedicationAsTaken('ir_sensor');
      } else {
        // Ask user if they want to mark this medication as taken
        if (confirm(`The IR sensor detected medication taken. Mark ${nextMed.name} as taken?`)) {
          markMedicationAsTaken('ir_sensor');
        }
      }
    }
  } else {
    showNotification('IR sensor detected medication, but no scheduled medication was found.', 'warning');
  }
}

// Mark a specific medication as taken by ID
function markSpecificMedicationAsTaken(medicationId) {
  const medIndex = medications.findIndex(med => med.id === medicationId);
  
  if (medIndex !== -1) {
    // Add to history
    if (!medications[medIndex].history) {
      medications[medIndex].history = [];
    }
    
    // Create a record for this medication
    medications[medIndex].history.push({
      date: new Date().toISOString(),
      scheduled: new Date().toISOString(), // Using current time as scheduled time
      taken: true,
      source: 'ir_sensor'
    });
    
    // Save to localStorage
    saveMedicationsToStorage();
    
    // Update UI
    updateStatistics();
    
    // Clear relevant active reminders
    activeReminders.delete(medications[medIndex].id + '_remind');
    activeReminders.delete(medications[medIndex].id + '_take');
    
    // Close the reminder modal if open
    document.getElementById('reminderModal').style.display = 'none';
    clearInterval(reminderCountdownInterval);
    
    // Show confirmation
    showNotification(`${medications[medIndex].name} marked as taken via IR sensor!`, 'success');
  }
}

// Create a WebSocket simulation test button (for development)
function addSimulationButton() {
  const actionButtons = document.querySelector('.action-buttons');
  
  if (actionButtons) {
    const simButton = document.createElement('button');
    simButton.id = 'simulateIrBtn';
    simButton.className = 'btn secondary-btn';
    simButton.innerHTML = '<i class="fas fa-robot"></i> Simulate IR Sensor';
    simButton.style.marginLeft = '10px';
    
    simButton.addEventListener('click', () => {
      if (isArduinoConnected) {
        // Send simulation message to server
        arduinoSocket.send(JSON.stringify({
          type: 'simulation',
          medication: ''
        }));
      } else {
        // Directly simulate if not connected
        handleMedicationTakenEvent({
          type: 'medication_taken',
          medication: '',
          timestamp: new Date().toISOString(),
          simulated: true
        });
      }
    });
    
    actionButtons.appendChild(simButton);
  }
}

// Initialize the application
function initApp() {
  // Set current date as default for date inputs
  setDefaultDates();
  
  // Load medications from localStorage
  loadMedications();
  
  // Set up event listeners
  setupEventListeners();
  
  // Update next medication schedule
  updateNextMedication();
  
  // Update statistics
  updateStatistics();
  
  // Load user settings
  loadSettings();
  
  // Add simulation button for testing
  addSimulationButton();
  
  // Add device styles
  addDeviceStyles();
}

// Load user settings
function loadSettings() {
  const savedSettings = localStorage.getItem('medicationSettings');
  if (savedSettings) {
    const settings = JSON.parse(savedSettings);
    if (settings.minReminderDuration) {
      minReminderDuration = settings.minReminderDuration;
      
      // Update the reminder duration select if it exists
      const reminderDurationSelect = document.getElementById('reminderDuration');
      if (reminderDurationSelect) {
        // Convert seconds back to minutes or special value
        if (minReminderDuration >= 86400) {
          reminderDurationSelect.value = 'until-action';
        } else {
          const minutes = Math.floor(minReminderDuration / 60);
          // Find the closest option
          const options = Array.from(reminderDurationSelect.options).map(opt => opt.value);
          const closestOption = options.find(opt => opt !== 'until-action' && parseInt(opt) >= minutes) || options[0];
          reminderDurationSelect.value = closestOption;
        }
      }
    }
  }
}

// Save user settings
function saveSettings() {
  const settings = {
    minReminderDuration: minReminderDuration
  };
  localStorage.setItem('medicationSettings', JSON.stringify(settings));
}

// Set default dates for the form
function setDefaultDates() {
  const today = new Date();
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  
  // Format date to YYYY-MM-DD
  const formattedToday = today.toISOString().split('T')[0];
  
  // Set default start date to today
  startDateInput.value = formattedToday;
  
  // Set default end date to 30 days from now
  const endDate = new Date();
  endDate.setDate(today.getDate() + 30);
  endDateInput.value = endDate.toISOString().split('T')[0];
}

// Set up all event listeners
function setupEventListeners() {
  // Add Medicine Button
  document.getElementById('addMedicineBtn').addEventListener('click', () => {
    document.getElementById('addMedicineModal').style.display = 'block';
  });
  
  // Close Modal
  document.querySelector('.close-modal').addEventListener('click', () => {
    document.getElementById('addMedicineModal').style.display = 'none';
  });
  
  // Cancel Button
  document.getElementById('cancelMedBtn').addEventListener('click', () => {
    document.getElementById('addMedicineModal').style.display = 'none';
  });
  
  // Save Medication Button
  document.getElementById('medicineForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveMedication();
  });
  
  // Add Time Button
  document.getElementById('addTimeBtn').addEventListener('click', addTimeSlot);
  
  // Add one time slot by default
  if (document.querySelectorAll('.time-input-group').length === 0) {
    addTimeSlot();
  }
  
  // Theme switching buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme');
      setTheme(theme);
    });
  });
  
  // Take Medication Button
  document.getElementById('takeMedBtn').addEventListener('click', () => {
    markMedicationAsTaken();
  });
  
  // Snooze Reminder Button
  document.getElementById('snoozeReminderBtn').addEventListener('click', () => {
    snoozeReminder();
  });
  
  // Only allow closing reminder modal after minimum time has passed
  const reminderCloseBtn = document.querySelector('.reminder-modal .close-modal');
  if (reminderCloseBtn) {
    reminderCloseBtn.addEventListener('click', (e) => {
      // Check if minimum time has passed
      const elapsedTime = parseInt(document.getElementById('reminderModal').getAttribute('data-elapsed') || 0);
      if (elapsedTime < minReminderDuration) {
        e.preventDefault();
        showNotification(`Please wait ${Math.ceil((minReminderDuration - elapsedTime) / 60)} more minute(s) before closing`, 'warning');
      } else {
        document.getElementById('reminderModal').style.display = 'none';
        clearInterval(reminderCountdownInterval);
      }
    });
  }
  
  // Close modal when clicking outside the content
  window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('addMedicineModal')) {
      document.getElementById('addMedicineModal').style.display = 'none';
    }
    if (e.target === document.getElementById('reminderModal')) {
      // Check if minimum time has passed
      const elapsedTime = parseInt(document.getElementById('reminderModal').getAttribute('data-elapsed') || 0);
      if (elapsedTime >= minReminderDuration) {
        document.getElementById('reminderModal').style.display = 'none';
        clearInterval(reminderCountdownInterval);
      } else {
        showNotification(`Please wait ${Math.ceil((minReminderDuration - elapsedTime) / 60)} more minute(s) before closing`, 'warning');
      }
    }
  });
  
  // Add event listener to notification settings
  document.getElementById('reminderTime').addEventListener('change', updateReminderSettings);
}

// Add new function to update reminder settings
function updateReminderSettings() {
  const reminderTimeSelect = document.getElementById('reminderTime');
  const reminderDurationSelect = document.getElementById('reminderDuration');
  
  if (reminderDurationSelect) {
    const selectedValue = reminderDurationSelect.value;
    if (selectedValue === 'until-action') {
      // Use a very large number (several hours) to ensure it stays until action
      minReminderDuration = 86400; // 24 hours in seconds
    } else {
      minReminderDuration = parseInt(selectedValue) * 60; // Convert minutes to seconds
    }
    saveSettings();
  }
}

// Add a new time slot in the form
function addTimeSlot() {
  const timeSchedules = document.getElementById('timeSchedules');
  const newTimeGroup = document.createElement('div');
  newTimeGroup.className = 'time-input-group';
  
  newTimeGroup.innerHTML = `
    <input type="time" class="schedule-time" required>
    <button type="button" class="remove-time-btn"><i class="fas fa-minus-circle"></i></button>
  `;
  
  timeSchedules.appendChild(newTimeGroup);
  
  // Add event listener to remove button
  const removeBtn = newTimeGroup.querySelector('.remove-time-btn');
  removeBtn.addEventListener('click', () => {
    if (document.querySelectorAll('.time-input-group').length > 1) {
      newTimeGroup.remove();
    } else {
      alert('You need at least one time schedule');
    }
  });
}

// Save medication to localStorage and update UI
function saveMedication() {
  const nameInput = document.getElementById('medName');
  const dosageInput = document.getElementById('medDosage');
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  const reminderTime = document.getElementById('reminderTime');
  
  // Get all time inputs
  const timeInputs = document.querySelectorAll('.schedule-time');
  const schedules = Array.from(timeInputs).map(input => input.value);
  
  // Get selected color
  const selectedColor = document.querySelector('input[name="medColor"]:checked').value;
  
  // Create new medication object
  const newMedication = {
    id: Date.now().toString(), // Unique ID
    name: nameInput.value,
    dosage: dosageInput.value,
    startDate: startDateInput.value,
    endDate: endDateInput.value,
    schedules: schedules,
    color: selectedColor,
    reminderMinutes: parseInt(reminderTime.value),
    history: [], // Empty history of taking medication
    active: true
  };
  
  // Add to medications array
  medications.push(newMedication);
  
  // Save to localStorage
  saveMedicationsToStorage();
  
  // Update UI
  renderMedicationTable();
  updateNextMedication();
  updateStatistics();
  
  // Close modal and reset form
  document.getElementById('addMedicineModal').style.display = 'none';
  document.getElementById('medicineForm').reset();
  
  // Set default dates again for next time
  setDefaultDates();
  
  // Clear time slots and add one default
  clearTimeSlots();
  addTimeSlot();
  
  // Show confirmation
  showNotification('Medication added successfully!', 'success');
}

// Clear all time slots from the form
function clearTimeSlots() {
  const timeSchedules = document.getElementById('timeSchedules');
  timeSchedules.innerHTML = '';
}

// Load medications from localStorage
function loadMedications() {
  const savedMedications = localStorage.getItem('medications');
  if (savedMedications) {
    medications = JSON.parse(savedMedications);
    renderMedicationTable();
  }
}

// Save medications to localStorage
function saveMedicationsToStorage() {
  localStorage.setItem('medications', JSON.stringify(medications));
}

// Render the medication table
function renderMedicationTable() {
  const tableBody = document.getElementById('medTableBody');
  tableBody.innerHTML = '';
  
  if (medications.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="6" class="text-center">No medications added yet</td>';
    tableBody.appendChild(emptyRow);
    return;
  }
  
  medications.forEach(med => {
    const row = document.createElement('tr');
    
    // Format the schedules for display
    const schedulesDisplay = med.schedules.map(time => formatTime(time)).join(', ');
    
    row.innerHTML = `
      <td>
        <span class="med-color" style="background-color: ${med.color};"></span>
        ${med.name}
      </td>
      <td>${med.dosage}</td>
      <td>${schedulesDisplay}</td>
      <td>${formatDate(med.startDate)} - ${formatDate(med.endDate)}</td>
      <td>${med.active ? '<span class="status-badge active">Active</span>' : '<span class="status-badge inactive">Inactive</span>'}</td>
      <td>
        <button class="btn secondary-btn edit-btn" data-id="${med.id}">
          <i class="fas fa-edit"></i> Edit
        </button>
        <button class="btn danger-btn delete-btn" data-id="${med.id}">
          <i class="fas fa-trash"></i> Delete
        </button>
      </td>
    `;
    
    tableBody.appendChild(row);
  });
  
  // Add event listeners to edit and delete buttons
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const medId = btn.getAttribute('data-id');
      editMedication(medId);
    });
  });
  
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const medId = btn.getAttribute('data-id');
      deleteMedication(medId);
    });
  });
}

// Edit a medication
function editMedication(medId) {
  const medication = medications.find(med => med.id === medId);
  if (!medication) return;
  
  // Fill the form with medication data
  document.getElementById('medName').value = medication.name;
  document.getElementById('medDosage').value = medication.dosage;
  document.getElementById('startDate').value = medication.startDate;
  document.getElementById('endDate').value = medication.endDate;
  
  // Set color
  document.querySelector(`input[value="${medication.color}"]`).checked = true;
  
  // Set reminder time
  document.getElementById('reminderTime').value = medication.reminderMinutes;
  
  // Clear time slots and add the existing ones
  clearTimeSlots();
  medication.schedules.forEach(schedule => {
    const timeSchedules = document.getElementById('timeSchedules');
    const timeGroup = document.createElement('div');
    timeGroup.className = 'time-input-group';
    
    timeGroup.innerHTML = `
      <input type="time" class="schedule-time" value="${schedule}" required>
      <button type="button" class="remove-time-btn"><i class="fas fa-minus-circle"></i></button>
    `;
    
    timeSchedules.appendChild(timeGroup);
    
    // Add event listener to remove button
    const removeBtn = timeGroup.querySelector('.remove-time-btn');
    removeBtn.addEventListener('click', () => {
      if (document.querySelectorAll('.time-input-group').length > 1) {
        timeGroup.remove();
      } else {
        alert('You need at least one time schedule');
      }
    });
  });
  
  // Store the medication ID for updating
  document.getElementById('medicineForm').setAttribute('data-edit-id', medId);
  
  // Change the save button text
  document.getElementById('saveMedBtn').textContent = 'Update Medication';
  
  // Show the modal
  document.getElementById('addMedicineModal').style.display = 'block';
  
  // Change the form submission handler
  const form = document.getElementById('medicineForm');
  const existingHandler = form.onsubmit;
  form.onsubmit = (e) => {
    e.preventDefault();
    updateMedication(medId);
    
    // Restore the original handler
    form.onsubmit = existingHandler;
  };
}

// Update an existing medication
function updateMedication(medId) {
  const medIndex = medications.findIndex(med => med.id === medId);
  if (medIndex === -1) return;
  
  const nameInput = document.getElementById('medName');
  const dosageInput = document.getElementById('medDosage');
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  const reminderTime = document.getElementById('reminderTime');
  
  // Get all time inputs
  const timeInputs = document.querySelectorAll('.schedule-time');
  const schedules = Array.from(timeInputs).map(input => input.value);
  
  // Get selected color
  const selectedColor = document.querySelector('input[name="medColor"]:checked').value;
  
  // Update medication object
  medications[medIndex] = {
    ...medications[medIndex],
    name: nameInput.value,
    dosage: dosageInput.value,
    startDate: startDateInput.value,
    endDate: endDateInput.value,
    schedules: schedules,
    color: selectedColor,
    reminderMinutes: parseInt(reminderTime.value)
  };
  
  // Save to localStorage
  saveMedicationsToStorage();
  
  // Update UI
  renderMedicationTable();
  updateNextMedication();
  updateStatistics();
  
  // Close modal and reset form
  document.getElementById('addMedicineModal').style.display = 'none';
  document.getElementById('medicineForm').reset();
  document.getElementById('saveMedBtn').textContent = 'Save Medication';
  
  // Set default dates again for next time
  setDefaultDates();
  
  // Clear time slots and add one default
  clearTimeSlots();
  addTimeSlot();
  
  // Show confirmation
  showNotification('Medication updated successfully!', 'success');
}

// Delete a medication
function deleteMedication(medId) {
  if (!confirm('Are you sure you want to delete this medication?')) {
    return;
  }
  
  medications = medications.filter(med => med.id !== medId);
  
  // Save to localStorage
  saveMedicationsToStorage();
  
  // Update UI
  renderMedicationTable();
  updateNextMedication();
  updateStatistics();
  
  // Show confirmation
  showNotification('Medication deleted successfully!', 'warning');
}

// Update next medication display
function updateNextMedication() {
  clearTimeout(nextMedicationTimeout);
  
  const nextMed = getNextMedication();
  const nextMedElement = document.getElementById('nextMedName');
  const countdownElement = document.getElementById('medCountdown');
  
  if (!nextMed) {
    nextMedElement.textContent = 'No upcoming medications';
    countdownElement.textContent = '';
    return;
  }
  
  // Update the next medication name
  nextMedElement.textContent = `${nextMed.name} - ${nextMed.dosage}`;
  
  // Update the countdown
  updateCountdown(nextMed.nextDose, countdownElement);
  
  const now = new Date();
  
  // Check if it's exactly time to take the medication
  if (now >= nextMed.nextDose && !activeReminders.has(nextMed.id + '_take')) {
    showMedicationReminder(nextMed, 'take');
    activeReminders.add(nextMed.id + '_take');
  }
  // Check if it's time to show the reminder before medication time
  else {
    const reminderMinutes = nextMed.reminderMinutes || 3;
    const reminderTime = new Date(nextMed.nextDose);
    reminderTime.setMinutes(reminderTime.getMinutes() - reminderMinutes);
    
    if (now >= reminderTime && now < nextMed.nextDose && !activeReminders.has(nextMed.id + '_remind')) {
      showMedicationReminder(nextMed, 'remind');
      activeReminders.add(nextMed.id + '_remind');
    }
  }
  
  // Set timeout to check again in 1 second
  nextMedicationTimeout = setTimeout(updateNextMedication, 1000);
}

// Get the next upcoming medication dose
function getNextMedication() {
  const now = new Date();
  let nextMed = null;
  let nextTime = null;
  
  medications.forEach(med => {
    // Skip inactive medications
    if (!med.active) return;
    
    // Check if the medication is within its date range
    const startDate = new Date(med.startDate);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(med.endDate);
    endDate.setHours(23, 59, 59, 999);
    
    if (now < startDate || now > endDate) return;
    
    // Find the next dosage time for today
    med.schedules.forEach(time => {
      const [hours, minutes] = time.split(':').map(Number);
      
      const doseTime = new Date();
      doseTime.setHours(hours, minutes, 0, 0);
      
      // If the dose time has passed for today, set it for tomorrow
      if (doseTime <= now) {
        doseTime.setDate(doseTime.getDate() + 1);
      }
      
      if (!nextTime || doseTime < nextTime) {
        nextTime = doseTime;
        nextMed = {
          ...med,
          nextDose: doseTime
        };
      }
    });
  });
  
  return nextMed;
}

// Update the countdown display
function updateCountdown(targetTime, element) {
  const now = new Date();
  const difference = targetTime - now;
  
  if (difference <= 0) {
    element.textContent = 'Now!';
    return;
  }
  
  const hours = Math.floor(difference / (1000 * 60 * 60));
  const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((difference % (1000 * 60)) / 1000);
  
  element.textContent = `in ${hours}h ${minutes}m ${seconds}s`;
}

// Show the medication reminder modal
function showMedicationReminder(medication, type) {
  // Check if the reminder is already showing
  if (document.getElementById('reminderModal').style.display === 'block') {
    return;
  }
  
  // Set reminder details
  document.getElementById('reminderMedName').textContent = medication.name;
  document.getElementById('reminderDosage').textContent = `Dosage: ${medication.dosage}`;
  
  const reminderHeader = document.querySelector('.reminder-header h2');
  
  if (type === 'take') {
    // It's time to take the medication now
    reminderHeader.innerHTML = '<i class="fas fa-bell"></i> Take Your Medication Now!';
    document.querySelector('.reminder-countdown p').textContent = 'Time remaining to record this dose:';
  } else {
    // It's just a reminder that medication time is approaching
    reminderHeader.innerHTML = '<i class="fas fa-bell"></i> Medication Reminder';
    document.querySelector('.reminder-countdown p').textContent = 'Time remaining before you need to take this medication:';
    
    // Calculate time until actual dose
    const timeUntilDose = Math.floor((medication.nextDose - new Date()) / 1000);
    if (timeUntilDose > 0) {
      startReminderCountdown(medication, timeUntilDose);
    } else {
      startReminderCountdown(medication);
    }
  }
  
  // Add elapsed time attribute to track how long the modal has been open
  document.getElementById('reminderModal').setAttribute('data-elapsed', '0');
  
  // Show the modal
  document.getElementById('reminderModal').style.display = 'block';
  
  // Make sure the modal stays in focus and is visible
  document.getElementById('reminderModal').classList.add('persistent');
  
  // Start the countdown timer (default to 3 minutes for take type)
  if (type === 'take') {
    startReminderCountdown(medication);
  }

  // Play notification sound
  playNotificationSound();
  
  // Also show a system notification if browser supports it
  showBrowserNotification(medication, type);
}

// Browser notifications
function showBrowserNotification(medication, type) {
  if (!("Notification" in window)) {
    return; // Browser doesn't support notifications
  }
  
  if (Notification.permission === "granted") {
    createNotification(medication, type);
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        createNotification(medication, type);
      }
    });
  }
}

function createNotification(medication, type) {
  const title = type === 'take' ? 'Take Your Medication Now!' : 'Medication Reminder';
  const options = {
    body: `${medication.name} - ${medication.dosage}`,
    icon: 'https://cdn-icons-png.flaticon.com/512/3004/3004458.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/3004/3004458.png',
    requireInteraction: true
  };
  
  const notification = new Notification(title, options);
  notification.onclick = function() {
    window.focus();
    this.close();
  };
}

// Start the countdown timer for the reminder
function startReminderCountdown(medication, customDuration = null) {
  const countdownElement = document.getElementById('reminderCountdown');
  let duration = customDuration || Math.max(minReminderDuration, 3 * 60); // Use larger of min duration or 3 minutes
  let elapsedTime = 0;
  
  // Clear any existing interval
  clearInterval(reminderCountdownInterval);
  
  // Update countdown every second
  reminderCountdownInterval = setInterval(() => {
    const minutes = Math.floor(duration / 60);
    let seconds = duration % 60;
    seconds = seconds < 10 ? '0' + seconds : seconds;
    
    countdownElement.textContent = `${minutes}:${seconds}`;
    
    // Increment elapsed time
    elapsedTime++;
    document.getElementById('reminderModal').setAttribute('data-elapsed', elapsedTime.toString());
    
    // Update the button status based on elapsed time
    updateReminderCloseButton(elapsedTime);
    
    if (--duration < 0) {
      clearInterval(reminderCountdownInterval);
      document.getElementById('reminderModal').style.display = 'none';
      
      // Clear from active reminders when dismissed
      activeReminders.delete(medication.id + '_remind');
      activeReminders.delete(medication.id + '_take');
    }
  }, 1000);
}

// Update the close button status based on elapsed time
function updateReminderCloseButton(elapsedTime) {
  const closeBtn = document.querySelector('.reminder-modal .close-modal');
  if (closeBtn) {
    if (elapsedTime < minReminderDuration) {
      closeBtn.classList.add('disabled');
      closeBtn.setAttribute('title', `Please wait ${Math.ceil((minReminderDuration - elapsedTime) / 60)} more minute(s)`);
    } else {
      closeBtn.classList.remove('disabled');
      closeBtn.setAttribute('title', 'Close');
    }
  }
}

// Mark a medication as taken
function markMedicationAsTaken(source = 'manual') {
  const nextMed = getNextMedication();
  if (!nextMed) return;
  
  // Find the medication in the array
  const medIndex = medications.findIndex(med => med.id === nextMed.id);
  if (medIndex === -1) return;
  
  // Add to history
  if (!medications[medIndex].history) {
    medications[medIndex].history = [];
  }
  
  medications[medIndex].history.push({
    date: new Date().toISOString(),
    scheduled: nextMed.nextDose.toISOString(),
    taken: true,
    source: source // Record the source of the medication action
  });
  
  // Save to localStorage
  saveMedicationsToStorage();
  
  // Update UI
  updateStatistics();
  
  // Clear active reminders
  activeReminders.delete(nextMed.id + '_remind');
  activeReminders.delete(nextMed.id + '_take');
  
  // Close the reminder modal
  document.getElementById('reminderModal').style.display = 'none';
  clearInterval(reminderCountdownInterval);
  
  // Show confirmation
  const sourceText = source === 'ir_sensor' ? ' via IR sensor' : '';
  showNotification(`Medication marked as taken${sourceText}!`, 'success');
}

// Snooze the reminder
function snoozeReminder() {
  const nextMed = getNextMedication();
  
  // Hide the reminder modal
  document.getElementById('reminderModal').style.display = 'none';
  clearInterval(reminderCountdownInterval);
  
  // Clear this reminder from active state
  if (nextMed) {
    activeReminders.delete(nextMed.id + '_remind');
    activeReminders.delete(nextMed.id + '_take');
  }
  
  // Show confirmation
  showNotification('Reminder snoozed for 5 minutes', 'warning');
  
  // Set timeout to show the reminder again after 5 minutes
  setTimeout(() => {
    const currentMed = getNextMedication();
    if (currentMed) {
      // Check which type of reminder to show based on current time
      const now = new Date();
      if (now >= currentMed.nextDose) {
        showMedicationReminder(currentMed, 'take');
      } else {
        showMedicationReminder(currentMed, 'remind');
      }
    }
  }, 5 * 60 * 1000);
}

// Update statistics display
function updateStatistics() {
  const activeMedsCount = document.getElementById('activeMedsCount');
  const takenTodayCount = document.getElementById('takenTodayCount');
  const adherenceRate = document.getElementById('adherenceRate');
  
  // Count active medications
  const activeMeds = medications.filter(med => med.active);
  activeMedsCount.textContent = activeMeds.length;
  
  // Count taken today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let totalDosesToday = 0;
  let takenDosesToday = 0;
  
  medications.forEach(med => {
    if (!med.active) return;
    
    // Check if medicine is scheduled for today
    const startDate = new Date(med.startDate);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(med.endDate);
    endDate.setHours(23, 59, 59, 999);
    
    if (today < startDate || today > endDate) return;
    
    // Count doses scheduled for today
    totalDosesToday += med.schedules.length;
    
    // Count doses taken today
    if (med.history) {
      med.history.forEach(record => {
        const takenDate = new Date(record.date);
        if (takenDate >= today && takenDate < new Date(today.getTime() + 24 * 60 * 60 * 1000)) {
          takenDosesToday++;
        }
      });
    }
  });
  
  takenTodayCount.textContent = `${takenDosesToday}/${totalDosesToday}`;
  
  // Calculate adherence rate
  let totalScheduled = 0;
  let totalTaken = 0;
  
  medications.forEach(med => {
    if (med.history) {
      totalTaken += med.history.length;
    }
    
    // Calculate total scheduled doses
    const startDate = new Date(med.startDate);
    const endDate = new Date(med.endDate);
    const currentDate = new Date();
    
    if (currentDate < startDate) return;
    
    const endForCalculation = currentDate > endDate ? endDate : currentDate;
    
    // Calculate days between start and end/current
    const daysDifference = Math.floor((endForCalculation - startDate) / (24 * 60 * 60 * 1000)) + 1;
    
    // Calculate total doses that should have been taken
    totalScheduled += daysDifference * med.schedules.length;
  });
  
  const rate = totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : 0;
  adherenceRate.textContent = `${rate}%`;
}

// Set the theme
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  activeTheme = theme;
  
  // Update active class on theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    if (btn.getAttribute('data-theme') === theme) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Show notification
function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
      <span>${message}</span>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Fade in
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

// Play notification sound
function playNotificationSound() {
  const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-alert-212.mp3');
  audio.play().catch(e => console.log('Audio play failed:', e));
}

// Helper functions
function formatTime(timeString) {
  const [hours, minutes] = timeString.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return date.toLocaleDateString(undefined, options);
}

// Add CSS for notifications
const notificationStyles = document.createElement('style');
notificationStyles.innerHTML = `
  .notification {
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 15px;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
    transform: translateY(20px);
    opacity: 0;
    transition: all 0.3s ease;
    z-index: 1000;
  }
  
  .notification.show {
    transform: translateY(0);
    opacity: 1;
  }
  
  .notification-content {
    display: flex;
    align-items: center;
  }
  
  .notification-content i {
    margin-right: 10px;
    font-size: 18px;
  }
  
  .notification.success {
    border-left: 4px solid var(--success-color);
  }
  
  .notification.success i {
    color: var(--success-color);
  }
  
  .notification.warning {
    border-left: 4px solid var(--warning-color);
  }
  
  .notification.warning i {
    color: var(--warning-color);
  }
  
  .notification.info {
    border-left: 4px solid var(--primary-color);
  }
  
  .notification.info i {
    color: var(--primary-color);
  }
  
  .status-badge {
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }
  
  .status-badge.active {
    background-color: var(--primary-light);
    color: var(--primary-dark);
  }
  
  .status-badge.inactive {
    background-color: #f5f5f5;
    color: var(--text-light);
  }
`;

document.head.appendChild(notificationStyles);

// Add CSS for the persistent reminder modal
const additionalStyles = document.createElement('style');
additionalStyles.innerHTML = `
  .reminder-modal.persistent {
    z-index: 2000; /* Ensure it's on top */
  }
  
  .reminder-modal .close-modal.disabled {
    color: #ccc;
    cursor: not-allowed;
  }
  
  .reminder-settings {
    margin-top: 20px;
    padding-top: 15px;
    border-top: 1px solid var(--border-color);
  }
  
  .reminder-settings h3 {
    font-size: 16px;
    margin-bottom: 10px;
    color: var(--text-light);
  }
  
  .settings-group {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    margin-bottom: 15px;
  }
  
  .settings-item {
    flex: 1;
    min-width: 200px;
  }
`;

document.head.appendChild(additionalStyles);

// Update or create device list in UI
function updateDevicesList() {
  // First check if we have any ESP8266 devices
  const espDevices = connectedDevices.filter(d => d.type === 'esp8266');
  if (espDevices.length === 0) {
    return; // No devices to show
  }
  
  // Find or create devices section
  let deviceSection = document.getElementById('connectedDevicesSection');
  if (!deviceSection) {
    // Create the section
    deviceSection = document.createElement('section');
    deviceSection.id = 'connectedDevicesSection';
    deviceSection.className = 'device-list-section';
    
    // Create header
    const header = document.createElement('h2');
    header.innerHTML = '<i class="fas fa-microchip"></i> Connected Devices';
    deviceSection.appendChild(header);
    
    // Create content container
    const devicesContainer = document.createElement('div');
    devicesContainer.id = 'connectedDevicesList';
    devicesContainer.className = 'devices-container';
    deviceSection.appendChild(devicesContainer);
    
    // Add to dashboard after the stats panel
    const statsPanel = document.querySelector('.stats-panel');
    if (statsPanel) {
      statsPanel.parentNode.insertBefore(deviceSection, statsPanel.nextSibling);
    } else {
      document.querySelector('.dashboard').appendChild(deviceSection);
    }
  }
  
  // Update the devices list
  const devicesContainer = document.getElementById('connectedDevicesList');
  devicesContainer.innerHTML = ''; // Clear existing content
  
  espDevices.forEach(device => {
    const deviceCard = document.createElement('div');
    deviceCard.className = 'device-card';
    
    deviceCard.innerHTML = `
      <div class="device-icon">
        <i class="fas fa-microchip"></i>
      </div>
      <div class="device-info">
        <h3>${device.deviceId}</h3>
        <p>IP: ${device.ip || 'Unknown'}</p>
        <p class="device-status">Status: <span class="status active">Active</span></p>
      </div>
    `;
    
    devicesContainer.appendChild(deviceCard);
  });
}

// Add device CSS styles to the page
function addDeviceStyles() {
  const styleElement = document.createElement('style');
  styleElement.innerHTML = `
    .device-list-section {
      background-color: var(--card-bg);
      border-radius: 10px;
      box-shadow: var(--shadow);
      padding: 20px;
      margin-bottom: 20px;
    }
    
    .device-list-section h2 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
    }
    
    .device-list-section h2 i {
      margin-right: 10px;
      color: var(--primary-color);
    }
    
    .devices-container {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 15px;
    }
    
    .device-card {
      background-color: var(--bg-color);
      border-radius: 8px;
      padding: 15px;
      display: flex;
      align-items: center;
      transition: all 0.2s ease;
    }
    
    .device-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
    }
    
    .device-icon {
      width: 50px;
      height: 50px;
      background-color: var(--primary-light);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 15px;
    }
    
    .device-icon i {
      font-size: 24px;
      color: var(--primary-dark);
    }
    
    .device-info h3 {
      font-size: 16px;
      margin-bottom: 5px;
      color: var(--text-color);
    }
    
    .device-info p {
      font-size: 12px;
      color: var(--text-light);
      margin: 2px 0;
    }
    
    .device-status .status {
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 11px;
    }
    
    .device-status .status.active {
      background-color: var(--success-light);
      color: var(--success-dark);
    }
    
    .device-status .status.inactive {
      background-color: var(--warning-light);
      color: var(--warning-dark);
    }
  `;
  
  document.head.appendChild(styleElement);
}
