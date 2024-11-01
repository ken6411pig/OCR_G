const express = require('express');
const multer = require('multer');
const vision = require('@google-cloud/vision');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

const app = express();

app.use(cors({
    origin: '*'
}));

app.use(express.static('public'));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 10
    }
});

const client = new vision.ImageAnnotatorClient({
    credentials: JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS)
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 添加 UTF-8 BOM 的函數
function addBOM(text) {
    return '\ufeff' + text;
}

app.post('/analyze', upload.array('images', 10), async (req, res) => {
    console.log('收到批次分析請求');
    
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: '未收到圖片' });
        }

        console.log(`開始處理 ${req.files.length} 張圖片...`);
        
        const outputDir = path.join(__dirname, 'output');
        await fs.mkdir(outputDir, { recursive: true });
        
        const results = await Promise.all(req.files.map(async (file, index) => {
            try {
                const [result] = await client.textDetection(file.buffer);
                const text = result.textAnnotations && result.textAnnotations.length > 0 
                    ? result.textAnnotations[0].description 
                    : '未檢測到文字';
                
                // 加入 BOM 並儲存檔案
                const filename = `result_${index + 1}_${Date.now()}.txt`;
                await fs.writeFile(
                    path.join(outputDir, filename),
                    addBOM(text),
                    { encoding: 'utf8' }
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

        // 建立彙整檔案，同樣加入 BOM
        const summaryFile = `summary_${Date.now()}.txt`;
        const summaryContent = results
            .map(r => `檔案: ${r.filename}\n${r.text ? r.text : '處理錯誤: ' + r.error}\n\n`)
            .join('---\n');
        
        await fs.writeFile(
            path.join(outputDir, summaryFile),
            addBOM(summaryContent),
            { encoding: 'utf8' }
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

// 修改下載路由，添加正確的 Content-Type 和 charset
app.get('/download/:filename', async (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'output', filename);
    
    try {
        await fs.access(filepath);
        
        // 設定正確的 Content-Type 和 charset
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
        
        const fileContent = await fs.readFile(filepath, 'utf8');
        res.send(fileContent);
    } catch (error) {
        res.status(404).json({ error: '檔案不存在' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`伺服器執行中: http://localhost:${PORT}`);
});
