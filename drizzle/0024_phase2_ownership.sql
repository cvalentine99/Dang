CREATE TABLE `analyst_action_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`action` varchar(64) NOT NULL,
	`targetType` varchar(64) NOT NULL,
	`targetId` varchar(128) NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analyst_action_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `investigation_sessions` DROP FOREIGN KEY `fk_is_userId`;
--> statement-breakpoint
ALTER TABLE `analyst_notes` MODIFY COLUMN `createdBy` int NOT NULL;--> statement-breakpoint
ALTER TABLE `investigation_sessions` MODIFY COLUMN `userId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `alert_queue` ADD `triageAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rag_sessions` ADD `userId` int NOT NULL;--> statement-breakpoint
CREATE INDEX `aaa_userId_createdAt_idx` ON `analyst_action_audit` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `aaa_target_idx` ON `analyst_action_audit` (`targetType`,`targetId`);--> statement-breakpoint
CREATE INDEX `aaa_action_createdAt_idx` ON `analyst_action_audit` (`action`,`createdAt`);--> statement-breakpoint
ALTER TABLE `investigation_sessions` ADD CONSTRAINT `fk_is_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `rs_userId_idx` ON `rag_sessions` (`userId`);