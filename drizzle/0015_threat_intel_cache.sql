-- Migration: Create threat_intel_cache table
-- Persistent cache for OTX threat intel API responses.
-- Two-tier caching: NodeCache (RAM, 5 min) → DB (hours) → OTX API.

CREATE TABLE IF NOT EXISTS `threat_intel_cache` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cacheKey` VARCHAR(512) NOT NULL UNIQUE,
  `endpointType` ENUM('pulse','indicator','search','activity','status') NOT NULL,
  `responseData` JSON NOT NULL,
  `fetchedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` TIMESTAMP NOT NULL,
  INDEX `tic_cacheKey_idx` (`cacheKey`),
  INDEX `tic_expiresAt_idx` (`expiresAt`),
  INDEX `tic_endpointType_idx` (`endpointType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
