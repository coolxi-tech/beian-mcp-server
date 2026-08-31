import sharp from "sharp";

/**
 * 清理 Base64 前缀
 */
function cleanBase64(base64Str: string): Buffer {
    const cleanStr = base64Str.replace(/^data:image\/\w+;base64,/i, "");
    return Buffer.from(cleanStr, "base64");
}

/**
 * 滑块背景差异距离识别 (对应 PHP local_slider1)
 * @param targetImage 滑块小图 Base64
 * @param backgroundImage 背景大图 Base64
 * @returns 缺口 X 轴坐标
 */
export async function localSlider(
    targetImage: string,
    backgroundImage: string
): Promise<number> {
    // 1. 解码图片 Buffer
    const bgBuffer = cleanBase64(backgroundImage);
    const sliderBuffer = cleanBase64(targetImage);

    // 2. 自动裁剪滑块白边以获取真实宽度 (对应 $slider->trimImage(0))
    // trim() 会裁剪掉四周边缘同色/透明区域
    const { info: sliderInfo } = await sharp(sliderBuffer)
        .trim()
        .toBuffer({ resolveWithObject: true });

    const sw = sliderInfo.width; // 滑块真实宽度

    // 3. 【高层视觉预处理】大图：灰度化 -> 边缘提取 (Edge/Sobel) -> 二值化 (Threshold)
    // sharp 使用 convolve (卷积矩阵) 实现边缘提取 (等价于 Imagick 的 edgeImage(1))
    const laplacianKernel = {
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
    };

    const { data: bgGrid, info: bgInfo } = await sharp(bgBuffer)
        .grayscale() // 对应 modulateImage(100, 0, 100) 灰度化
        .convolve(laplacianKernel) // 对应 edgeImage(1) 边缘提取
        .threshold(20) // 对应 thresholdImage(20 * 257) 二值化 (0~255 范围，20 对应 20*257/257)
        .raw() // 导出原始单通道像素数组 (通道数 Channels = 1)
        .toBuffer({ resolveWithObject: true });

    const bw = bgInfo.width;
    const bh = bgInfo.height;

    // 4. 【水平投影法】把二维图片压缩成一维数组 (统计每列白点数)
    const columnScores = new Array<number>(bw).fill(0);

    for (let y = 0; y < bh; y++) {
        const rowOffset = y * bw;
        for (let x = 0; x < bw; x++) {
            // 像素值 > 128 视为白点（轮廓线）
            if (bgGrid[rowOffset + x] > 128) {
                columnScores[x]++;
            }
        }
    }

    // 5. 【单层循环】寻找跟滑块宽度 sw 最匹配的两个边缘突变点
    let bestX = 0;
    let maxScore = 0;

    // 缺口不可能在最左侧（跳过左边 1/4）
    const startX = Math.floor(sw / 4);
    const maxX = bw - sw - 5;

    for (let x = startX; x < maxX; x++) {
        // 缺口特征：左边缘 ($x) 和右边缘 ($x + sw) 的白点数量相加应该极大
        const currentScore = columnScores[x] + columnScores[x + sw];

        if (currentScore > maxScore) {
            maxScore = currentScore;
            bestX = x;
        }
    }

    return bestX;
}