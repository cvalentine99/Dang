CREATE TABLE IF NOT EXISTS `sensitive_access_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`resourceType` varchar(64) NOT NULL,
	`resourceId` varchar(128) NOT NULL,
	`action` varchar(32) NOT NULL,
	`ipAddress` varchar(45),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sensitive_access_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `saa_userId_idx` ON `sensitive_access_audit` (`userId`);
--> statement-breakpoint
CREATE INDEX `saa_resourceType_idx` ON `sensitive_access_audit` (`resourceType`);
--> statement-breakpoint
CREATE INDEX `saa_resourceId_idx` ON `sensitive_access_audit` (`resourceId`);
--> statement-breakpoint
CREATE INDEX `saa_createdAt_idx` ON `sensitive_access_audit` (`createdAt`);
