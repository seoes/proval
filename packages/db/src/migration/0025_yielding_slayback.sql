ALTER TABLE `repository` RENAME COLUMN "review_on_merge_request_open" TO "review_on_pull_request_open";--> statement-breakpoint
ALTER TABLE `repository` RENAME COLUMN "reply_to_merge_request_comment" TO "reply_to_pull_request_comment";--> statement-breakpoint
ALTER TABLE `repository` RENAME COLUMN "deep_research_on_merge_request" TO "deep_research_on_pull_request";