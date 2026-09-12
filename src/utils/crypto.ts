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

/**
 * AES-128-ECB + PKCS7 加密后 base64
 * 等价 PHP: base64_encode(openssl_encrypt($content, 'aes-128-ecb', $secretKey, OPENSSL_RAW_DATA))
 * 用于网安备案的 pointJson / captchaVerification 加密
 */
export function aesEcbEncryptBase64(content: string, secretKey: string): string {
    const cipher = crypto.createCipheriv(
        "aes-128-ecb",
        Buffer.from(secretKey, "latin1"),
        null
    );
    return Buffer.concat([
        cipher.update(Buffer.from(content, "latin1")),
        cipher.final(),
    ]).toString("base64");
}

