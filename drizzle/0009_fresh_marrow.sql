CREATE TABLE `graph_endpoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` varchar(32) NOT NULL,
	`hostname` varchar(256),
	`ipAddress` varchar(64),
	`osName` varchar(128),
	`osVersion` varchar(128),
	`osPlatform` varchar(64),
	`architecture` varchar(32),
	`agentVersion` varchar(64),
	`agentStatus` varchar(32),
	`lastKeepAlive` timestamp,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `graph_endpoints_id` PRIMARY KEY(`id`),
	CONSTRAINT `graph_endpoints_agentId_unique` UNIQUE(`agentId`)
);
--> statement-breakpoint
CREATE TABLE `graph_identities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`endpointId` int NOT NULL,
	`username` varchar(128) NOT NULL,
	`uid` varchar(32),
	`gid` varchar(32),
	`homeDir` varchar(512),
	`shell` varchar(128),
	`isAdmin` int NOT NULL DEFAULT 0,
	`userType` varchar(32),
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `graph_identities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `graph_network_ports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`endpointId` int NOT NULL,
	`processId` int,
	`localPort` int NOT NULL,
	`localIp` varchar(64),
	`remoteIp` varchar(64),
	`remotePort` int,
	`protocol` varchar(16),
	`state` varchar(32),
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `graph_network_ports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `graph_processes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`endpointId` int NOT NULL,
	`processName` varchar(256) NOT NULL,
	`pid` int,
	`ppid` int,
	`state` varchar(32),
	`userName` varchar(128),
	`cmdLine` text,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `graph_processes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `graph_security_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`endpointId` int,
	`alertId` varchar(64),
	`ruleId` varchar(32) NOT NULL,
	`ruleLevel` int,
	`ruleDescription` text,
	`mitreTactic` varchar(128),
	`mitreTechnique` varchar(128),
	`mitreId` varchar(32),
	`agentId` varchar(32),
	`agentName` varchar(256),
	`srcIp` varchar(64),
	`dstIp` varchar(64),
	`eventTimestamp` timestamp,
	`rawData` json,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `graph_security_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `graph_software_packages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`endpointId` int NOT NULL,
	`packageName` varchar(256) NOT NULL,
	`version` varchar(128),
	`architecture` varchar(32),
	`vendor` varchar(256),
	`format` varchar(32),
	`description` text,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `graph_software_packages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `graph_sync_status` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`lastSyncAt` timestamp,
	`entityCount` int NOT NULL DEFAULT 0,
	`status` enum('idle','syncing','completed','error') NOT NULL DEFAULT 'idle',
	`errorMessage` text,
	`durationMs` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `graph_sync_status_id` PRIMARY KEY(`id`),
	CONSTRAINT `graph_sync_status_entityType_unique` UNIQUE(`entityType`)
);
--> statement-breakpoint
CREATE TABLE `graph_vulnerabilities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`endpointId` int NOT NULL,
	`packageId` int,
	`cveId` varchar(32) NOT NULL,
	`cvssScore` varchar(8),
	`severity` varchar(16),
	`status` varchar(32),
	`packageName` varchar(256),
	`packageVersion` varchar(128),
	`title` text,
	`publishedAt` timestamp,
	`detectedAt` timestamp,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `graph_vulnerabilities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investigation_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`userId` int NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `investigation_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investigation_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(512) NOT NULL,
	`description` text,
	`status` enum('active','closed','archived') NOT NULL DEFAULT 'active',
	`evidence` json,
	`timeline` json,
	`tags` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `investigation_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ge_agentId_idx` ON `graph_endpoints` (`agentId`);--> statement-breakpoint
CREATE INDEX `ge_hostname_idx` ON `graph_endpoints` (`hostname`);--> statement-breakpoint
CREATE INDEX `gi_endpointId_idx` ON `graph_identities` (`endpointId`);--> statement-breakpoint
CREATE INDEX `gi_username_idx` ON `graph_identities` (`username`);--> statement-breakpoint
CREATE INDEX `gnp_endpointId_idx` ON `graph_network_ports` (`endpointId`);--> statement-breakpoint
CREATE INDEX `gnp_localPort_idx` ON `graph_network_ports` (`localPort`);--> statement-breakpoint
CREATE INDEX `gp_endpointId_idx` ON `graph_processes` (`endpointId`);--> statement-breakpoint
CREATE INDEX `gp_processName_idx` ON `graph_processes` (`processName`);--> statement-breakpoint
CREATE INDEX `gse_endpointId_idx` ON `graph_security_events` (`endpointId`);--> statement-breakpoint
CREATE INDEX `gse_ruleId_idx` ON `graph_security_events` (`ruleId`);--> statement-breakpoint
CREATE INDEX `gse_mitreTactic_idx` ON `graph_security_events` (`mitreTactic`);--> statement-breakpoint
CREATE INDEX `gse_agentId_idx` ON `graph_security_events` (`agentId`);--> statement-breakpoint
CREATE INDEX `gse_eventTimestamp_idx` ON `graph_security_events` (`eventTimestamp`);--> statement-breakpoint
CREATE INDEX `gsp_endpointId_idx` ON `graph_software_packages` (`endpointId`);--> statement-breakpoint
CREATE INDEX `gsp_packageName_idx` ON `graph_software_packages` (`packageName`);--> statement-breakpoint
CREATE INDEX `gv_endpointId_idx` ON `graph_vulnerabilities` (`endpointId`);--> statement-breakpoint
CREATE INDEX `gv_cveId_idx` ON `graph_vulnerabilities` (`cveId`);--> statement-breakpoint
CREATE INDEX `gv_severity_idx` ON `graph_vulnerabilities` (`severity`);--> statement-breakpoint
CREATE INDEX `in_sessionId_idx` ON `investigation_notes` (`sessionId`);--> statement-breakpoint
CREATE INDEX `is_userId_idx` ON `investigation_sessions` (`userId`);--> statement-breakpoint
CREATE INDEX `is_status_idx` ON `investigation_sessions` (`status`);