import { z } from "zod";

const branchNameSchema = z
    .string()
    .trim()
    .min(1, "Allowed target branch is empty")
    .max(255, "Allowed target branch is too long")
    .refine((branch) => !/[\s,:]/.test(branch), "Allowed target branch contains an invalid character")
    .refine((branch) => !branch.startsWith("refs/"), "Allowed target branch must not start with refs/");

const allowedTargetBranchListSchema = z
    .array(branchNameSchema, {
        error: "Allowed target branches must be a list",
    })
    .max(32, "Too many allowed target branches")
    .transform((branchList) => [...new Set(branchList)]);

export function validateAllowedBranchList(branchList: string[]): string[] {
    const parsed = allowedTargetBranchListSchema.safeParse(branchList);
    if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid allowed target branches");
    }
    return parsed.data;
}

export function isAllowedTargetBranch(allowList: readonly string[], targetBranch: string): boolean {
    return allowList.length === 0 || allowList.includes(targetBranch);
}
