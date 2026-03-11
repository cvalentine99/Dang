CREATE TABLE IF NOT EXISTS `ticket_artifacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` varchar(128) NOT NULL,
	`system` enum('splunk_es','jira','servicenow','custom') NOT NULL DEFAULT 'splunk_es',
	`queueItemId` int NOT NULL,
	`pipelineRunId` int,
	`triageId` varchar(64),
	`alertId` varchar(128) NOT NULL,
	`ruleId` varchar(32),
	`ruleLevel` int,
	`createdBy` varchar(256) NOT NULL,
	`success` boolean NOT NULL,
	`statusMessage` text,
	`rawResponse` json,
	`httpStatusCode` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ticket_artifacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ta_ticketId_idx` ON `ticket_artifacts` (`ticketId`);
--> statement-breakpoint
CREATE INDEX `ta_queueItemId_idx` ON `ticket_artifacts` (`queueItemId`);
--> statement-breakpoint
CREATE INDEX `ta_pipelineRunId_idx` ON `ticket_artifacts` (`pipelineRunId`);
--> statement-breakpoint
CREATE INDEX `ta_triageId_idx` ON `ticket_artifacts` (`triageId`);
--> statement-breakpoint
CREATE INDEX `ta_alertId_idx` ON `ticket_artifacts` (`alertId`);
--> statement-breakpoint
CREATE INDEX `ta_system_idx` ON `ticket_artifacts` (`system`);
--> statement-breakpoint
CREATE INDEX `ta_createdAt_idx` ON `ticket_artifacts` (`createdAt`);
