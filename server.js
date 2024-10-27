const express = require('express');
const multer = require('multer');
const vision = require('@google-cloud/vision');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

const app = express();

// CORS 設定
app.use(cors({
    origin: '*'
}));

app.use(express.static('public'));

// 設定多檔案上傳
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 限制每個檔案 5MB
        files: 10 // 最多允許10張圖片
    }
});

const client = new vision.ImageAnnotatorClient({
    credentials: JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS)
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 處理多張圖片上傳和辨識
app.post('/analyze', upload.array('images', 10), async (req, res) => {
    console.log('收到批次分析請求');
    
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: '未收到圖片' });
        }

        console.log(`開始處理 ${req.files.length} 張圖片...`);
        
        // 建立輸出目錄
        const outputDir = path.join(__dirname, 'output');
        await fs.mkdir(outputDir, { recursive: true });
        
        // 處理每張圖片
        const results = await Promise.all(req.files.map(async (file, index) => {
            try {
                const [result] = await client.textDetection(file.buffer);
                const text = result.textAnnotations && result.textAnnotations.length > 0 
                    ? result.textAnnotations[0].description 
                    : '未檢測到文字';
                
                // 儲存個別圖片的文字結果
                const filename = `result_${index + 1}_${Date.now()}.txt`;
                await fs.writeFile(
                    path.join(outputDir, filename),
                    text,
                    'utf8'
                );
                
                return {
                    filename: file.originalname,
                    text: text,
                    outputFile: filename
                };
            } catch (error) {
                return {
                    filename: file.originalname,
                    error: error.message
                };
            }
        }));

        // 建立彙整檔案
        const summaryFile = `summary_${Date.now()}.txt`;
        const summaryContent = results
            .map(r => `檔案: ${r.filename}\n${r.text ? r.text : '處理錯誤: ' + r.error}\n\n`)
            .join('---\n');
        
        await fs.writeFile(
            path.join(outputDir, summaryFile),
            summaryContent,
            'utf8'
        );

        res.json({
            results: results,
            summaryFile: summaryFile
        });

    } catch (error) {
        console.error('處理錯誤:', error);
        res.status(500).json({
            error: '處理過程發生錯誤',
            details: error.message
        });
    }
});

// 新增下載文字檔的路由
app.get('/download/:filename', async (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'output', filename);
    
    try {
        await fs.access(filepath);
        res.download(filepath);
    } catch (error) {
        res.status(404).json({ error: '檔案不存在' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`伺服器執行中: http://localhost:${PORT}`);
});
