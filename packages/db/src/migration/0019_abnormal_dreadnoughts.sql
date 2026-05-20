ALTER TABLE `repository` RENAME COLUMN "gitlab_repository_id" TO "git_provider_repository_id";--> statement-breakpoint
DROP INDEX `repository_gitlabRepositoryId_gitProviderAccessId_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `repository_gitProviderRepositoryId_gitProviderAccessId_unique` ON `repository` (`git_provider_repository_id`,`git_provider_access_id`);