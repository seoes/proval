ALTER TABLE `model_provider` RENAME COLUMN "concurrency" TO "request_concurrency";--> statement-breakpoint
ALTER TABLE `model_provider` ADD `activity_concurrency` integer;--> statement-breakpoint
UPDATE `activity` SET `status` = 'failed', `error_message` = 'Interrupted by process restart', `completed_at` = unixepoch() WHERE `status` = 'started';--> statement-breakpoint
CREATE UNIQUE INDEX `activity_one_queued_pr_review` ON `activity` (`repository_id`,`target_iid`) WHERE "activity"."type" = 'pr_review' AND "activity"."status" = 'queued';--> statement-breakpoint
CREATE UNIQUE INDEX `activity_one_started_pr_review` ON `activity` (`repository_id`,`target_iid`) WHERE "activity"."type" = 'pr_review' AND "activity"."status" = 'started';
