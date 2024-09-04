import puppeteer, { Browser } from "puppeteer-core";
import * as fs from 'fs';


const url = "https://www.airbnb.pt/rooms/49651214?search_mode=regular_search&check_in=2024-09-13&check_out=2024-09-15&source_impression_id=p3_1725365979_P38gfqpcFAYZPRBH&previous_page_section_name=1000&federated_search_id=e56e6207-5e9e-42aa-aae2-2b5b7ac0d42d";
const found = 0;

const main = async () => {
    const browser: Browser = await puppeteer.launch({ 
        headless: false,
        executablePath: '/opt/google/chrome/google-chrome' 
    });
    const page = await browser.newPage();

    // Set viewport to ensure the entire page is visible
    await page.setViewport({ width: 1920, height: 1080 });

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

    
    // Array to store all review data
    let reviewsData = [];

    // Use page.evaluate to interact with the DOM
    try {
        await page.evaluate(() => {
            const div = document.querySelector('.rk4wssy.atm_c8_km0zk7.atm_g3_18khvle.atm_fr_1m9t47k.atm_cs_10d11i2.atm_h3_ftgil2.atm_9s_1txwivl.atm_h_1h6ojuz.atm_cx_1y44olf.atm_c8_2x1prs__oggzyc.atm_g3_1jbyh58__oggzyc.atm_fr_11a07z3__oggzyc.dir.dir-ltr');
            if (div) {
                const link = div.querySelector('a[href*="/rooms/"][href*="/reviews"]') as HTMLElement;
                if (link) {
                    link.click();
                    console.log("Clicked the link inside the div.");
                } else {
                    console.log("No link found inside the div.");
                }
            } else {
                console.log("Div with specified class not found.");
            }
        });

        // Add a delay to ensure the reviews section is fully loaded
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 seconds
        console.log("Reviews section is fully loaded.");

        let height = 0;
        let max_scrolls = 0;
        // Start infinite scroll loop inside the modal
        while (max_scrolls < 50) {
            let previous_height = height;
            await page.evaluate(() => {
                const scrollableDiv = document.querySelector('._17itzz4'); // Replace with the correct selector
                height = scrollableDiv.scrollHeight;
                if (scrollableDiv) {
                    scrollableDiv.scrollBy(0, 1000); // Scroll down by 500 pixels within the modal
                }
            });
            max_scrolls++;
            //if (previous_height === height) break;

            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 seconds
            console.log("Scrolled down by 500 pixels inside the modal.");

            // Listen for network responses
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


        }
    } catch (error) {
        console.log("An error occurred while interacting with the reviews link.");
    }
    

    await page.screenshot({path: "airbnb.jpg"})
    await browser.close();
    
    // Save the collected reviews data to a JSON file
    fs.writeFileSync('intercepted_reviews.json', JSON.stringify(reviewsData, null, 2));
    console.log("Reviews data saved to intercepted_reviews.json");
}

main();