const express = require('express');
const multer = require('multer');
const vision = require('@google-cloud/vision');
const cors = require('cors');
const path = require('path');

const app = express();

// CORS 設定
app.use(cors({
    origin: '*'  // 開發時允許所有來源
}));

// 設定靜態檔案
app.use(express.static('public'));

// 設定檔案上傳
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 限制 5MB
    }
});

// 建立 Vision 客戶端
const client = new vision.ImageAnnotatorClient({
    keyFilename: './config/vision-api-key.json'
});

// 首頁路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 處理圖片上傳和辨識
app.post('/analyze', upload.single('image'), async (req, res) => {
    console.log('收到分析請求');
    
    try {
        if (!req.file) {
            return res.status(400).json({ error: '未收到圖片' });
        }

        console.log('開始處理圖片...');
        const [result] = await client.textDetection(req.file.buffer);
        console.log('文字辨識完成');

        if (!result.textAnnotations || result.textAnnotations.length === 0) {
            return res.json({ text: '未檢測到文字' });
        }

        res.json({
            text: result.textAnnotations[0].description
        });

    } catch (error) {
        console.error('處理錯誤:', error);
        res.status(500).json({
            error: '處理過程發生錯誤',
            details: error.message
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`伺服器執行中於端口: ${PORT}`);
});
});
