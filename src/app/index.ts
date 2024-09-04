import puppeteer from 'puppeteer-extra'; 
import StealthPlugin = require('puppeteer-extra-plugin-stealth');
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import * as fs from 'fs';

// Define the shape of review data
interface Review {
    reviewer_name: string;
    comment_pt: string;
    // Add other properties based on the structure of your review data
}

const url = "https://www.airbnb.pt/rooms/49651214?search_mode=regular_search&check_in=2024-09-13&check_out=2024-09-15&source_impression_id=p3_1725365979_P38gfqpcFAYZPRBH&previous_page_section_name=1000&federated_search_id=e56e6207-5e9e-42aa-aae2-2b5b7ac0d42d";

const main = async () => {
    // Use the plugins with puppeteer-extra
    puppeteer.use(StealthPlugin());  // Apply the stealth plugin
    puppeteer.use(AdblockerPlugin({ blockTrackers: true }));  // Apply the adblocker plugin

    const browser = await puppeteer.launch({ 
        headless: false,
        executablePath: '/opt/google/chrome/google-chrome' 
    });
    const page = await browser.newPage();

    // Set viewport to ensure the entire page is visible
    await page.setViewport({ width: 1920, height: 1080 });

    // Array to store all review data
    let reviewsData: Review[] = [];

    // Listen for network responses to intercept the early loaded previews
    page.on('response', async (response) => {
        const requestUrl = response.url();
        if (requestUrl.includes('https://www.airbnb.pt/api/v3/StaysPdpReviewsQuery/')) {
            try {
                const jsonResponse = await response.json();
                // Assuming the data structure follows what you showed in the screenshot
                const reviews = jsonResponse.data.presentation.stayProductDetailPage.reviews.reviews;
                reviewsData = reviewsData.concat(reviews);
                console.log(`Captured ${reviews.length} reviews from network request.`);
            } catch (error) {
                console.error(`Failed to parse JSON response from: ${requestUrl}`, error);
            }
        }
    });

    await page.goto(url, { waitUntil: 'networkidle2' }); // Wait for network to be idle
    // Close the translation pop-up if it appears
    try {
        await page.waitForSelector('button[aria-label="Fechar"]', { timeout: 10000 });
        await page.click('button[aria-label="Fechar"]');
        console.log("Translation pop-up was sucessfully closed.")
    } catch (error) {
        console.log("No translation pop-up found, or it was already closed.");
    }

    // Close the Airbnb cookie banner if it appears using a more specific selector
    try {
        await page.waitForSelector('button[type="button"].l1ovpqvx', { timeout: 10000 });
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button[type="button"].l1ovpqvx'));
            buttons.forEach(button => {
                if ((button as HTMLElement).textContent?.trim() === "OK") {
                    (button as HTMLElement).click();
                }
            });
        });
        console.log("Cookie banner pop-up was successfully closed.");
    } catch (error) {
        console.log("No cookie pop-up found, or it was already closed.");
    }


    // Use page.evaluate to interact with the DOM
    try {
        const NumReviews = await page.evaluate(() => {
            const div = document.querySelector('.rk4wssy.atm_c8_km0zk7.atm_g3_18khvle.atm_fr_1m9t47k.atm_cs_10d11i2.atm_h3_ftgil2.atm_9s_1txwivl.atm_h_1h6ojuz.atm_cx_1y44olf.atm_c8_2x1prs__oggzyc.atm_g3_1jbyh58__oggzyc.atm_fr_11a07z3__oggzyc.dir.dir-ltr');
            if (!div) return 0; // Handle case where div is null
            
            const link = div.querySelector('a[href*="/rooms/"][href*="/reviews"]') as HTMLElement;
            if (!link || !link.textContent) return 0;

            link.click();
            
            // Ensure textContent is not null and extract the number
            const reviewsText = link.textContent?.match(/\d+/);
            if (!reviewsText) return 0; // Handle case where match returns null

            return parseInt(reviewsText[0]);
        });

        // Add a delay to ensure the reviews section is fully loaded
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 seconds
        console.log("Reviews section is fully loaded.");
        console.log(NumReviews);


        let max_scrolls = 0;
        // Start infinite scroll loop inside the modal
        while (max_scrolls < (NumReviews/2)) {
            await page.evaluate(() => {
                const scrollableDiv = document.querySelector('._17itzz4'); 
                if (!scrollableDiv) return;

                scrollableDiv.scrollBy(0, 500); // Scroll down by 500 pixels within the modal
            });

            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 seconds
            console.log("Scrolled down by 500 pixels inside the modal.");
            max_scrolls++;

            // Listen for network responses
            page.on('response', async (response) => {
                const requestUrl = response.url();
                if (requestUrl.includes('https://www.airbnb.pt/api/v3/StaysPdpReviewsQuery/')) {
                    try {
                        const jsonResponse = await response.json();
                        // Assuming the data structure follows what you showed in the screenshot
                        const rev : Review = {
                            reviewer_name: jsonResponse.data.presentation.stayProductDetailPage.reviews.reviews[0].reviewer.firstName,
                            comment_pt: "boris"
                        };
                        reviewsData = reviewsData.concat(rev);
                        console.log("Captured " + rev.reviewer_name + " reviews from network request.");
                    } catch (error) {
                        console.error(`Failed to parse JSON response from: ${requestUrl}`, error);
                    }
                }
            });


        }
    } catch (error) {
        console.log("An error occurred while interacting with the reviews link or there are no reviews.");
    }
    

    await page.screenshot({path: "airbnb.jpg"})
    await browser.close();
    
    // Save the collected reviews data to a JSON file
    fs.writeFileSync('intercepted_reviews.json', JSON.stringify(reviewsData, null, 2));
    console.log("Reviews data saved to intercepted_reviews.json");
}

main();