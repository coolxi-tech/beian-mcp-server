import crypto from "node:crypto";

/**
 * 生成带自定义前缀的 UUID
 * @param name 前缀名称（如 'point'）
 * @returns 例如: 'point-1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'
 */
export function generateUuid(name?: string): string {
    const id = crypto.randomUUID();
    return name ? `${name}-${id}` : id;
}

export function encryptPointJson(content: string, secretKey: string): string {
    const contentBuffer = Buffer.from(content, "latin1");
    const keyBuffer = Buffer.from(secretKey, "latin1");

    const cipher = crypto.createCipheriv("aes-128-ecb", keyBuffer, null);
    let encrypted = cipher.update(contentBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return encrypted.toString("base64");
}