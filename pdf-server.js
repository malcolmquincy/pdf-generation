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
        const startTime = Date.now();
        
        console.log(`Starting PDF generation for: ${url}`);
        
        // Launch browser with stable configuration
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-gpu',
                '--disable-software-rasterizer'
            ],
            timeout: 60000,
            protocolTimeout: 240000
        });

        page = await browser.newPage();
        
        // Set longer timeouts and error handlers
        page.setDefaultTimeout(120000);
        page.setDefaultNavigationTimeout(120000);
        
        // Set viewport for consistent rendering
        await page.setViewport({ width: 1200, height: 800 });
        await page.emulateMediaType('screen');
        
        // Block unnecessary resources to speed up loading
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            const url = request.url();
            
            // Allow important resources for PDF content
            if (url.includes('maps.googleapis.com') || url.includes('maps.gstatic.com')) {
                // Allow Google Maps resources
                request.continue();
            } else if (resourceType === 'image') {
                // Allow all images (hero images, property images, etc.)
                request.continue();
            } else if (resourceType === 'font') {
                // Block fonts to speed up loading (PDF will use system fonts)
                request.abort();
            } else if (['media', 'websocket', 'manifest'].includes(resourceType)) {
                // Block heavy multimedia resources
                request.abort();
            } else {
                // Allow everything else (CSS, JS, etc.)
                request.continue();
            }
        });
        
        // Navigate with retries
        let navigationSuccess = false;
        let attempts = 0;
        const maxAttempts = 3;
        
        while (!navigationSuccess && attempts < maxAttempts) {
            attempts++;
            try {
                await page.goto(url, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 60000 
                });
                
                // Wait for the page to be more fully loaded
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Check if Google Maps is present and try to wait for it
                const hasMap = await page.$('#propertyMap');
                if (hasMap) {
                    try {
                        // Wait for map tiles to load (look for img elements in the map)
                        await page.waitForSelector('#propertyMap img', { timeout: 10000 });
                    } catch (mapError) {
                        // Map images did not load within timeout, continuing...
                    }
                    
                    // Additional wait for map rendering
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
                
                navigationSuccess = true;
            } catch (navError) {
                if (attempts === maxAttempts) {
                    throw new Error(`Failed to navigate after ${maxAttempts} attempts: ${navError.message}`);
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

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
            
            maps.forEach((mapEl, index) => {
                const container = mapEl.closest('.property-map-container');
                if (container) {
                    const staticImg = container.querySelector('.property-map-image');
                    if (staticImg) {
                        staticImg.style.display = 'block';
                        staticImg.style.visibility = 'visible';
                        mapEl.style.display = 'none';
                    } else {
                        mapEl.style.display = 'none';
                    }
                }
            });
            
            // Also handle any map loading indicators
            const loadingElements = document.querySelectorAll('.map-loading');
            loadingElements.forEach(el => el.style.display = 'none');
        });

        // Wait for layout adjustments and ensure all content is ready
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Final check that the page content is fully rendered
        await page.evaluate(() => {
            return new Promise((resolve) => {
                if (document.readyState === 'complete') {
                    resolve();
                } else {
                    window.addEventListener('load', resolve);
                }
            });
        });
        
        // Verify page is still active before PDF generation
        if (page.isClosed()) {
            throw new Error('Page was closed before PDF generation');
        }
        
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
        } catch (pdfError) {
            console.error('PDF generation failed:', pdfError.message);
            throw new Error(`PDF generation failed: ${pdfError.message}`);
        }
        
        // Validate PDF
        if (!pdf || pdf.length === 0) {
            throw new Error('PDF generation produced empty result');
        }
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`PDF generated successfully: ${pdf.length} bytes in ${duration}s`);
        
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