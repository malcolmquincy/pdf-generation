const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'PDF Generator',
        timestamp: new Date().toISOString()
    });
});

app.post('/generate-pdf', async (req, res) => {
    let browser = null;
    let page = null;
    
    try {
        const { url, filename = 'document.pdf' } = req.body;
        
        console.log(`Starting PDF generation for: ${url}`);
        
        // Launch browser with stable configuration
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ],
            timeout: 60000
        });

        page = await browser.newPage();
        
        // Set longer timeouts and error handlers
        page.setDefaultTimeout(60000);
        page.setDefaultNavigationTimeout(60000);
        
        // Set viewport for consistent rendering
        await page.setViewport({ width: 1200, height: 800 });
        await page.emulateMediaType('screen');
        
        // Navigate with retries
        let navigationSuccess = false;
        let attempts = 0;
        const maxAttempts = 3;
        
        while (!navigationSuccess && attempts < maxAttempts) {
            attempts++;
            try {
                await page.goto(url, { 
                    waitUntil: 'networkidle2',
                    timeout: 45000 
                });
                navigationSuccess = true;
                console.log(`Navigation successful on attempt ${attempts}`);
            } catch (navError) {
                console.log(`Navigation attempt ${attempts} failed: ${navError.message}`);
                if (attempts === maxAttempts) {
                    throw new Error(`Failed to navigate after ${maxAttempts} attempts: ${navError.message}`);
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // Wait for content to load
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Inject optimized PDF CSS
        await page.addStyleTag({
            content: `
                /* Essential PDF optimization styles */
                body {
                    font-size: 10px !important;
                    line-height: 1.2 !important;
                    color: #000 !important;
                    background: white !important;
                    margin: 0 !important;
                    padding: 10px !important;
                }
                
                .sidebar, .advisor-message-form, .nav-menu, 
                .fa-envelope {
                    display: none !important;
                }
                
                /* Hide interactive buttons but keep financial data buttons */
                button:not(.btn-outline-primary):not(.btn-outline-success):not(.no-hide) {
                    display: none !important;
                }
                
                /* Style financial buttons as normal table text */
                .btn-outline-primary, .btn-outline-success {
                    background: none !important;
                    border: none !important;
                    color: #000 !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    font-weight: 600 !important;
                    font-size: 9px !important;
                    text-decoration: none !important;
                    display: inline !important;
                    cursor: default !important;
                    line-height: 1.2 !important;
                }
                
                .main-content {
                    margin-left: 0 !important;
                    width: 100% !important;
                    max-width: 100% !important;
                }
                
                /* Page break controls */
                [data-pdf-break="before"] {
                    page-break-before: always !important;
                }
                
                [data-pdf-break="after"] {
                    page-break-after: always !important;
                }
                
                [data-pdf-break-inside="avoid"], [data-pdf-avoid-break] {
                    page-break-inside: avoid !important;
                }
                
                /* Compact sections */
                section, .section {
                    margin: 10px 0 !important;
                    padding: 10px 0 !important;
                    page-break-inside: avoid !important;
                }
                
                /* Hero section optimization */
                .hero-section {
                    min-height: 280px !important;
                    height: 280px !important;
                    page-break-after: avoid !important;
                }
                
                .hero-bg {
                    position: absolute !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: cover !important;
                    z-index: 1 !important;
                }
                
                .hero-content {
                    position: relative !important;
                    z-index: 10 !important;
                }
                
                /* Table optimization */
                .table th, .table td {
                    padding: 0.3rem 0.6rem !important;
                    font-size: 9px !important;
                }
                
                /* Compact Property Images section */
                #property-images {
                    margin: 5px 0 !important;
                    padding: 5px 0 !important;
                }
                
                .image-grid {
                    display: grid !important;
                    grid-template-columns: repeat(4, 1fr) !important;
                    gap: 5px !important;
                    margin: 5px 0 !important;
                }
                
                .property-image {
                    width: 100% !important;
                    height: 80px !important;
                    object-fit: cover !important;
                    border-radius: 4px !important;
                }
                
                /* Force Sources & Uses to stay with Property Details */
                #sources-uses {
                    page-break-before: avoid !important;
                    margin-top: 10px !important;
                }
                
                /* Map handling */
                .interactive-map, .map-loading {
                    display: none !important;
                }
                
                .property-map-image {
                    display: block !important;
                    width: 100% !important;
                    height: 300px !important;
                    object-fit: cover !important;
                    border-radius: 8px !important;
                }
            `
        });

        // Handle page break attributes
        await page.evaluate(() => {
            document.querySelectorAll('[data-pdf-break]').forEach(el => {
                const value = el.getAttribute('data-pdf-break');
                if (value === 'before') {
                    el.style.pageBreakBefore = 'always';
                } else if (value === 'after') {
                    el.style.pageBreakAfter = 'always';
                }
            });
        });

        // Replace interactive maps with static maps
        await page.evaluate(() => {
            // Extract coordinates from interactive maps and replace with static maps
            const maps = document.querySelectorAll('.interactive-map');
            maps.forEach(mapEl => {
                const container = mapEl.closest('.property-map-container');
                if (container) {
                    const staticImg = container.querySelector('.property-map-image');
                    if (staticImg) {
                        staticImg.style.display = 'block';
                        mapEl.style.display = 'none';
                    }
                }
            });
        });

        // Wait for layout adjustments
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Verify page is still active before PDF generation
        if (page.isClosed()) {
            throw new Error('Page was closed before PDF generation');
        }
        
        console.log('Starting PDF generation...');
        
        // Generate PDF with error handling
        let pdf;
        try {
            pdf = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '0.4in',
                    right: '0.4in',
                    bottom: '0.4in',
                    left: '0.4in'
                },
                scale: 0.85,
                timeout: 30000
            });
            
            console.log(`PDF generated successfully: ${pdf.length} bytes`);
        } catch (pdfError) {
            console.error('PDF generation failed:', pdfError.message);
            throw new Error(`PDF generation failed: ${pdfError.message}`);
        }
        
        // Validate PDF
        if (!pdf || pdf.length === 0) {
            throw new Error('PDF generation produced empty result');
        }
        
        // Send response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdf.length);
        res.end(pdf);

    } catch (error) {
        console.error('PDF generation error:', error.message);
        console.error('Error stack:', error.stack);
        
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to generate PDF', 
                message: error.message 
            });
        }
    } finally {
        try {
            if (page && !page.isClosed()) {
                await page.close();
            }
        } catch (e) {
            console.error('Error closing page:', e.message);
        }
        
        try {
            if (browser) {
                await browser.close();
            }
        } catch (e) {
            console.error('Error closing browser:', e.message);
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`PDF service running on port ${PORT}`);
});