import puppeteer from 'puppeteer-extra'; 
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import * as fs from 'fs';
import axios from 'axios';

// Define the shape of review data
interface Review {
    reviewer_name: string;
    review_date: string;
    picture_url: string;
    rating: number;
    duration_stay: string;
    comment_pt: string;
    original_language: string;
    needed_translation: boolean;
    id: number;
}

interface HostData { //This data goes to specific endpoint (apart from key and IDs)
    host_name: string;
    host_picUrl: string;
    timeAt_airbnb: string;
    media_rating: number;
    total_reviews: number;
}

interface ToSendBackend { //This data goes to same endpoint as the reviews
    property_id: number;
    accomodation_id: number;
    key: string;
}

// id airbnb //backend
// property id //to send
// accomodation id //to send
//last review id //backend
//key // to send

const url= "https://www.airbnb.pt/rooms/" + process.argv[2]; //AirBnb Radical Url +  AirBnb Id

const last_reviewId = parseInt(process.argv[3]);

let stop = 0;

if (!url) {
    console.error("Please provide a valid URL as a command-line argument. Example: npx ts-node index.ts 'your-url-here'");
    process.exit(1);
}


const main = async () => {
    // Use the plugins with puppeteer-extra
    puppeteer.use(StealthPlugin());  // Apply the stealth plugin
    //puppeteer.use(AdblockerPlugin({ blockTrackers: false }));  // Try to add an exception to the blocker !!!!!

    const browser = await puppeteer.launch({ 
        headless: false,
        executablePath: '/opt/google/chrome/google-chrome' 
    });
    const page = await browser.newPage();

    // Set viewport to ensure the entire page is visible
    await page.setViewport({ width: 1920, height: 1080 });

    // Array to store all review data
    let reviewsData: Review[] = [];

    // HostData object that will store data from host and from accomodation
    let host: HostData = {
        host_name: '',
        host_picUrl: '',
        timeAt_airbnb: '',
        media_rating: 0,
        total_reviews: 0
    };

    //ToSendBackend object that will follow the reviews path in order to manage it
    let keyNIds: ToSendBackend = {
        property_id: parseInt(process.argv[4]),
        accomodation_id: parseInt(process.argv[5]),
        key: process.argv[6]
    }


    // Listen for network responses to intercept the early loaded previews
    page.on('response', async (response) => {
        const requestUrl = response.url();
        if (requestUrl.includes('https://www.airbnb.pt/api/v3/StaysPdpReviewsQuery/')) {
            console.log('Captured URL:', requestUrl); // Log URLs for debugging
            try {
                const jsonResponse = await response.json();
                // Assuming the data structure follows what you showed in the screenshot
                const reviews = jsonResponse.data.presentation.stayProductDetailPage.reviews.reviews;

                let reviewsSmallArray: Review[] = [];//Array thats gonna have the same content size as the reviews array fetched each time
                let off = 0;
                for (let ind = 0; ind < reviews.length; ind++) {
                    let comparableID = parseInt(reviews[ind].id);
                    if (reviews[ind].localizedReview === null) {
                        const rev: Review = { //review input for same language
                            reviewer_name: reviews[ind].reviewer.firstName,
                            comment_pt: reviews[ind].comments,
                            original_language: reviews[ind].language,
                            needed_translation: false,
                            review_date: reviews[ind].createdAt,
                            picture_url: reviews[ind].reviewer.pictureUrl,
                            rating: reviews[ind].rating,
                            duration_stay: reviews[ind].reviewHighlight,
                            id: parseInt(reviews[ind].id)
                        };
                        if (last_reviewId >= comparableID) {
                            off = 1;
                            break;
                        } else {
                            reviewsData.push(rev);
                            reviewsSmallArray.push(rev);
                        }
                    } 
                    else {
                        const rev: Review = { //review input for different language
                            reviewer_name: reviews[ind].reviewer.firstName,
                            comment_pt: reviews[ind].localizedReview.comments,
                            original_language: reviews[ind].language,
                            needed_translation: reviews[ind].localizedReview.needsTranslation,
                            review_date: reviews[ind].createdAt,
                            picture_url: reviews[ind].reviewer.pictureUrl,
                            rating: reviews[ind].rating,
                            duration_stay: reviews[ind].reviewHighlight,
                            id: parseInt(reviews[ind].id)
                        };
                        if (last_reviewId >= comparableID) {
                            off = 1;
                            break;
                        } else {
                            reviewsData.push(rev);
                            reviewsSmallArray.push(rev);
                        }
                    }
                    console.log(comparableID);
                }

                //send the reviews fetched from AirBnb to the endpoint
                //axios.post("http://localhost:3000/users", reviewsSmallArray).then(response => {
                //    console.log(response)
                //});

                console.log(`Captured ${reviews.length} === ${reviewsSmallArray.length} reviews from network request.`);
                if (off) {
                        page.off('response');  // Remove the listener
                        stop = 1;
                }
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
        console.log("Translation pop-up was successfully closed.")
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
        const beforeReviews = await page.evaluate(() => {
            const hostDiv = document.querySelector('.t1pxe1a4.atm_c8_2x1prs.atm_g3_1jbyh58.atm_fr_11a07z3.atm_cs_10d11i2.dir.dir-ltr');
            if (!hostDiv) return { NumReviews: 0, rating: 0, imgSrc: '', hostName: '', time: ''};  // Return an empty string if the div is not found
            
            const hostText = hostDiv.textContent || '';  // Get the text content and provide fallback
            const hostName = hostText.replace('Hospedado por', '').trim();  // Remove "Hospedado por" and trim whitespace
            
            const liElement = document.querySelector('.s1l7gi0l .lgx66tx .l7n4lsf');
            if (!liElement) return { NumReviews: 0, rating: 0, imgSrc: '', hostName: '', time: ''};  // Return an empty string if the element is not found

            const time = liElement.textContent || '';  // Get the text content and provide fallback

            const imgElement = document.querySelector('.i9if2t0.atm_e2_idpfg4.atm_vy_idpfg4.atm_mk_stnw88.atm_e2_1osqo2v__1lzdix4.atm_vy_1osqo2v__1lzdix4.atm_mk_pfqszd__1lzdix4.i1cqnm0r.atm_jp_pyzg9w.atm_jr_nyqth1.i1de1kle.atm_vh_yfq0k3.dir.dir-ltr');
            const imgSrc = imgElement ? imgElement.getAttribute('src') : '';

            const div = document.querySelector('.rk4wssy.atm_c8_km0zk7.atm_g3_18khvle.atm_fr_1m9t47k.atm_cs_10d11i2.atm_h3_ftgil2.atm_9s_1txwivl.atm_h_1h6ojuz.atm_cx_1y44olf.atm_c8_2x1prs__oggzyc.atm_g3_1jbyh58__oggzyc.atm_fr_11a07z3__oggzyc.dir.dir-ltr');
            if (!div) return { NumReviews: 0, rating: 0, imgSrc: '', hostName: '', time: ''}; // Handle case where div is null
    
            // Log the rating's textContent before parsing
            const ratingElement = document.querySelector('.r1lutz1s.atm_c8_o7aogt.atm_c8_l52nlx__oggzyc.dir.dir-ltr');
            if (!ratingElement) return { NumReviews: 0, rating: 0, imgSrc: '', hostName: '', time: ''};;
            
            const ratingText = ratingElement.textContent;
            console.log("Rating text content:", ratingText);  // Log the raw content
            
            // Updated regex to match both 4.33 and 4,33
            const rating = ratingText?.match(/\d+[,.]?\d*/);
            if (!rating) return { NumReviews: 0, rating: 0, imgSrc: ''};
            
            const link = div.querySelector('a[href*="/rooms/"][href*="/reviews"]') as HTMLElement;
            if (!link || !link.textContent) return { NumReviews: 0, rating: 0, imgSrc: '', hostName: '', time: ''};;
    
            link.click();
    
            const reviewsText = link.textContent?.match(/\d+/);
            if (!reviewsText) return { NumReviews: 0, rating: 0, imgSrc: '', hostName: '', time: ''};
    
            // Replace comma with dot for correct float conversion
            return {
                NumReviews: parseInt(reviewsText[0]),
                rating: parseFloat(rating[0].replace(',', '.')), // Convert "4,33" to "4.33"
                imgSrc: imgSrc,
                hostName: hostName,
                time: time
            };
        });
        
        host.total_reviews = beforeReviews.NumReviews;
        host.media_rating = beforeReviews.rating;
        host.host_name = beforeReviews.hostName || '';
        host.host_picUrl = beforeReviews.imgSrc || '';
        host.timeAt_airbnb = beforeReviews.time || '';

        // Add a delay to ensure the reviews section is fully loaded
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 seconds
        console.log("Reviews section is fully loaded.");
        console.log(`Total number of reviews: ${beforeReviews.NumReviews}`);

        let max_scrolls = 0;
        // Start infinite scroll loop inside the modal
        while (max_scrolls < (beforeReviews.NumReviews / 2)) {
            if (stop === 1) break;
            await page.evaluate(() => {
                const scrollableDiv = document.querySelector('._17itzz4'); 
                if (!scrollableDiv) return;

                scrollableDiv.scrollBy(0, 500); // Scroll down by 500 pixels within the modal
            });

            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 seconds
            console.log("Scrolled down by 500 pixels inside the modal.");
            max_scrolls++;
        }
    } catch (error) {
        console.log("An error occurred while interacting with the reviews link or there are no reviews.");
    }

    await page.screenshot({path: "airbnb.jpg"})
    await browser.close();
    
    //axios.post("http://localhost:3000/users", {host, keyNIds}).then(response => {
      //  console.log(response)
    //});

    // Save the collected reviews data to a JSON file
    fs.writeFileSync('intercepted_reviews.json', JSON.stringify({reviewsData, host, keyNIds}, null, 3));
    console.log("Reviews data saved to intercepted_reviews.json");
}

main();
