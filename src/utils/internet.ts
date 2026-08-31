import userAgent from "fake-useragent";

export const getUA = ()=> {
    return userAgent();
};