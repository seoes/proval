import { env } from '$env/dynamic/public';

const fetchApi = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${env.PUBLIC_API_SERVER_HOST}/api${path}`, options);
    return response;
};

export default fetchApi;
