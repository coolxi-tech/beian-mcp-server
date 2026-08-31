// 服务类型常量：作为 z.enum 与 ServiceType 的唯一事实来源，避免枚举值双处维护
export const ICP_SERVICE_TYPES = ["web", "app", "microapp", "fastapp"] as const;

export type ServiceType = (typeof ICP_SERVICE_TYPES)[number];

export type IcpQueryParam = {
    search: string;
    type?: ServiceType;
    pageNum?: number;
    pageSize?: number;
};

export type IcpItem = {
    unitName: string;   // 主办单位名称
    natureName: string; // 主办单位性质
    mainLicence: string; // 备案号
    serviceName: string; // 网站/服务名称
    [key: string]: any;  // 其他动态属性
};

export type IcpResponse = {
    code: number;
    msg: string;
    params?: {
        list: IcpItem[];
    };
    success?: boolean;
};