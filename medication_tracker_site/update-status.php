<?php
$status = $_POST['status'] ?? '';
$time = $_POST['time'] ?? '';

// Save to log file (or use MySQL)
$file = fopen("log.txt", "a");
fwrite($file, "Status: $status at $time\n");
fclose($file);

echo "Received";
?>
