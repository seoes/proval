export type Pagination<T> = {
    itemList: T[];
    page: number;
    limit: number;
    total: number;
};
