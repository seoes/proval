export type GitHubAppResponse = {
    id: number;
    appId: number;
    slug: string;
    createdAt: Date;
    updatedAt: Date;
};

export type GitHubInstallationResponse = {
    id: number;
    installationId: number;
    accountName: string;
    accountType: "User" | "Organization";
    createdAt?: Date;
    updatedAt?: Date;
};

export type GitHubRepositoryResponse = {
    id: number;
    fullName: string;
    private: boolean;
    alreadyConnected: boolean;
};

type ManifestConversionResult = {
    id: number;
    slug: string;
    pem: string;
    webhook_secret?: string;
};

export type CreateAppInput = {
    appId: number;
    slug: string;
    privateKey: string;
    webhookSecret: string;
};
