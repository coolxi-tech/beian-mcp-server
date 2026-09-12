// 网安备案（公安部全国互联网安全管理服务平台 beian.mps.gov.cn）类型定义

/** 点选坐标（字符串形式，与 captcha/check、query/websearch 的加密结构一致） */
export type ClickPosition = {
    x: string;
    y: string;
};

/** captcha/get 返回的点选文字验证码数据 */
export type PoliceCaptchaData = {
    originalImageBase64: string; // 原始验证码图片 base64
    wordList: string[];          // 需要依次点选的文字
    secretKey: string;           // AES 密钥（16 位）
    token: string;               // 验证码令牌
    [key: string]: any;
};

/** cyber_portal 接口通用响应（repCode "0000" 表示成功） */
export type PoliceResponse<T = any> = {
    repCode?: string | null;
    repMsg?: string | null;
    repData?: T;
    success?: boolean;
    [key: string]: any;
};

/** query/websearch 查询到的备案详情 */
export type PoliceRecordInfo = {
    webnm: string;        // 网站名称
    maindm: string;       // 查询域名/单位
    webSiteStr: string[]; // 关联域名列表
    audittime: string;    // 审核时间
    unittype: string;     // 单位性质
    unitnm: string;       // 主办单位名称
    webtype: string;      // 网站类型
    polnm: string;        // 网安备案号
    department: string;   // 网安支队
    [key: string]: any;
};

/** query/websearch 查询响应 */
export type PoliceQueryResponse = {
    success?: boolean;
    code?: number | string;
    msg?: string;
    data?: PoliceRecordInfo;
    [key: string]: any;
};

export type PoliceQueryParam = {
    search: string;
};
