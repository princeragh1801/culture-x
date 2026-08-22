-- Runs once, on first boot of an empty data volume.
CREATE DATABASE IF NOT EXISTS `culturex_dev`  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS `culturex_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

GRANT ALL PRIVILEGES ON `culturex_dev`.*  TO 'culturex'@'%';
GRANT ALL PRIVILEGES ON `culturex_test`.* TO 'culturex'@'%';
FLUSH PRIVILEGES;
