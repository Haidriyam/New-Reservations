<?php
header('Content-Type: application/json');
echo json_encode([
    'success' => true,
    'php_version' => phpversion(),
    'sqlite' => in_array('sqlite', PDO::getAvailableDrivers())
]);
