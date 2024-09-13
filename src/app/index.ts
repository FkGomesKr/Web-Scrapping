import puppeteer from 'puppeteer-extra'; 
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import * as fs from 'fs';
import axios from 'axios';
import { Console } from 'console';

interface Reply {
    text: string;
    response: string;
}

// Define the shape of review data
interface Review {
    reviewer_name: string;
    //reviewer_pic: string;
    id: string; //probably a timestamp from when the review was posted
 /*   locale_code: string;
    rev_date: string;
    text: string;
    positive_negative_points: string[];
    title_text: string;
    travelers: string[];
    replies: Reply[];
    additional_messages: string[];*/
}

interface HostData { //This data goes to specific endpoint (apart from key and IDs)
    alojamento_name: string;
    address: string;
    media_rating: string;
    total_reviews: number;
    cleanliness_rating_percentage: number;
    staffNservice_rating_percentage: number;
    amenities_rating_percentage: number;
    propertyConditions_rating_percentage: number;
    ecoFriendliness_rating_percentage: number;
}

interface ToSendBackend { //This data goes to same endpoint as the reviews
    property_id: number;
    key: string;
}

// id booking //backend
// property id //to send
//last review id //backend
//key // to send

// NEED ENDPOINT FOR HostData
// NEED ENDPOINT FOR ToSendBackend and Reviews

const url = "https://www.agoda.com/pt-pt/le-faubourg-hotel/hotel/paris-fr.html?finalPriceView=2&isShowMobileAppPrice=false&cid=-1&numberOfBedrooms=&familyMode=false&adults=2&children=0&rooms=1&maxRooms=0&checkIn=2024-09-26&isCalendarCallout=false&childAges=&numberOfGuest=0&missingChildAges=false&travellerType=1&showReviewSubmissionEntry=false&currencyCode=EUR&isFreeOccSearch=false&tspTypes=2&los=1&searchrequestid=4ca1eec6-25b1-4a5e-9ac1-6b31334e4241&ds=Qge6SObb%2BAAN58k3"

const last_reviewId = BigInt(parseInt(process.argv[3]));

let stop = 0; // this variable will handle the closing of the listener
let length_previous_page = 0; 

if (!url) {
    console.error("Please provide a valid URL as a command-line argument. Example: npx ts-node index.ts 'your-url-here'");
    process.exit(1);
}


const main = async () => {
    // Use the plugins with puppeteer-extra
    puppeteer.use(StealthPlugin());  // Apply the stealth plugin
    //puppeteer.use(AdblockerPlugin({ blockTrackers: true }));  // Try to add an exception to the blocker !!!!!

    const browser = await puppeteer.launch({ 
        headless: false,
        executablePath: '/opt/google/chrome/google-chrome' 
    });
    const page = await browser.newPage();

    // Set viewport to ensure the entire page is visible
    await page.setViewport({ width: 1850, height: 910 });

    // Array to store all review data
    let reviewsData: Review[] = [];

    // HostData object that will store data from host and from accomodation
    let host: HostData = {
        alojamento_name: '',
        address: '',
        total_reviews: 0,
        media_rating: '',
        cleanliness_rating_percentage: 0,
        staffNservice_rating_percentage: 0,
        amenities_rating_percentage: 0,
        propertyConditions_rating_percentage: 0,
        ecoFriendliness_rating_percentage: 0
    };

    //ToSendBackend object that will follow the reviews path in order to manage it
    let keyNIds: ToSendBackend = {
        property_id: parseInt(process.argv[4]),
        key: process.argv[5]
    }

    let discardFirstUnordered = 0; // we must discard the first array of requests since its fetching before we order the reviews by date

    // Listen for network responses to intercept reviews each time a page is loaded
    page.on('response', async (response) => {
        const requestUrl = response.url();
        if (requestUrl.includes('https://www.agoda.com/api/cronos/property/review/ReviewComments')) {
            console.log('Captured URL:', requestUrl); // Log URLs for debugging
            try {
                const jsonResponse = await response.json();
                // Assuming the data structure follows what you showed in the screenshot
                const reviews = jsonResponse;
                let reviewsSmallArray: Review[] = [];//Array thats gonna have the same content size as the reviews array fetched each time

                let off = 0; //if off === 1 then the listener will be turned off
                for (let ind = 0; ind < reviews.comments.length; ind++) {
                    if (reviews.comments[ind].reviewProviderText  === "Agoda") {
                        let comparableID = BigInt(reviews.comments[ind].hotelReviewId);
                        /*
                        let goodBad_points_array : string[] = [];

                        if (reviews.propertyInfo.reviewInfo.reviews[ind].themes) {
                            for (let gb = 0; gb < reviews.propertyInfo.reviewInfo.reviews[ind].themes.length; gb++) {
                                goodBad_points_array.push(reviews.propertyInfo.reviewInfo.reviews[ind].themes[gb].label);
                            }
                        }*/

                        const rev: Review = { //review input
                            reviewer_name: reviews.comments[ind].reviewerInfo.displayMemberName || "Anónimo",
                            id: reviews.comments[ind].hotelReviewId
                            };

                        if (last_reviewId >= comparableID) {
                            off = 1;
                            break;
                        } else {
                                reviewsData.push(rev);
                                reviewsSmallArray.push(rev);
                            }
    /*
                        if (!discardFirstUnordered) {
                            host.total_reviews = reviews.propertyReviewSummaries[0].totalCount.raw;
                            host.media_rating = reviews.propertyReviewSummaries[0].overallScoreWithDescriptionA11y.value;
                            host.cleanliness_rating_percentage = reviews.propertyReviewSummaries[0].reviewSummaryDetails[0].ratingPercentage;
                            host.staffNservice_rating_percentage = reviews.propertyReviewSummaries[0].reviewSummaryDetails[1].ratingPercentage;
                            host.amenities_rating_percentage = reviews.propertyReviewSummaries[0].reviewSummaryDetails[2].ratingPercentage;
                            host.propertyConditions_rating_percentage= reviews.propertyReviewSummaries[0].reviewSummaryDetails[3].ratingPercentage;
                            host.ecoFriendliness_rating_percentage= reviews.propertyReviewSummaries[0].reviewSummaryDetails[4].ratingPercentage;
                            keyNIds.property_id = reviews.data.propertyInfo.id;
                        }*/
                        console.log(comparableID);
                    }
                }

                //send the reviews fetched from Booking to the endpoint
                if (discardFirstUnordered && reviewsSmallArray.length > 0) {
                    axios.post("http://localhost:3000/users", reviewsSmallArray).then(response => {
                    console.log(response);
                    });
                }

                console.log(`Captured ${reviews.length} === ${reviewsSmallArray.length} reviews from network request.`);
                length_previous_page = reviewsSmallArray.length;
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

    try {
        // Click the "Dismiss" cookies warning button
        try {
            await page.waitForSelector('button[data-element-name="consent-banner-reject-btn"]', { timeout: 10000 });
            await page.evaluate(() => {
                const acceptButton = document.querySelector('button[data-element-name="consent-banner-reject-btn"]');
                if (acceptButton) {
                    (acceptButton as HTMLElement).click();
                }
            });
            console.log("Clicked in the \"Dismiss\" cookies warning button sucessfully.");
        } catch (error) {
            console.log("No \"Dismiss\" cookies warning button found or it was already closed.");
        }

        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second

        try {
            // Click the "Comentários" button
            try {
                await page.waitForSelector('button[data-href="#customer-reviews-panel"]', { timeout: 10000 });
                await page.evaluate(() => {
                    const comentariosButton = document.querySelector('button[data-href="#customer-reviews-panel"]');
                    if (comentariosButton) {
                        (comentariosButton as HTMLElement).click();
                    }
                });
                console.log("Clicked the \"Comentários\" button successfully.");
            } catch (error) {
                console.log("No \"Comentários\" button found or it was already clicked.");
            }
        } catch (error) {
            console.error("An error occurred:", error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second

        try {
            // Click the "COMENTÁRIOS DE AGODA" button
            try {
                await page.waitForSelector('button[id="reviews-tab-1"]', { timeout: 10000 });
                await page.evaluate(() => {
                    const comentariosaAgodaButton = document.querySelector('button[id="reviews-tab-1"]');
                    if (comentariosaAgodaButton) {
                        (comentariosaAgodaButton as HTMLElement).click();
                    }
                });
                console.log("Clicked the \"COMENTÁRIOS DE AGODA\" button successfully.");
            } catch (error) {
                console.log("No \"COMENTÁRIOS DE AGODA\" button found or it was already clicked.");
            }
        } catch (error) {
            console.error("An error occurred:", error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second

        // Wait for the select element to appear
        await page.waitForSelector('select[id="review-sort-id"]', { timeout: 10000 });
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second

        //Click the select element and choose the "Mais recentes" option
        await page.evaluate(() => {
            const selectElement = document.querySelector('select[id="review-sort-id"]') as HTMLSelectElement;

            // If the select element is found
            if (selectElement) {
                selectElement.value = "1"; // Set the value of the select to "Mais recentes"
                const event = new Event('change', { bubbles: true }); // Trigger the 'change' event
                selectElement.dispatchEvent(event); // Dispatch the event to simulate the selection
            }
        });

        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second

        discardFirstUnordered = 1; // this is when the listener section is allowed to work normally
        console.log("troquei a ordem");
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 seconds
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 seconds
        // Add a delay to ensure the reviews section is fully loaded
        console.log("Reviews section is fully loaded.");

        let page_scrolls = 25;
        // Start scroll loop inside the modal
        while (page_scrolls > 0) {
            page_scrolls--;
            // Wait for the select element to appear
            await page.waitForSelector('button[aria-label="Página seguinte de avaliações"]', { timeout: 10000 });
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second

            //Click the button to go to the next page of reviews
            await page.evaluate(() => {
                const nextRevPageButton = document.querySelector('button[aria-label="Página seguinte de avaliações"]');
                    if (nextRevPageButton) {
                        (nextRevPageButton as HTMLElement).click();
                    }
            });
            //page_scrolls -= length_previous_page; 

            if (stop) break;
            console.log("Button to advance page was successfully clicked.");
           
        }

    } catch (error) {
        console.log("No reviews link found, or it was already clicked.");
    }

    await browser.close();
    
    axios.post("http://localhost:3000/users", {host, keyNIds}).then(response => {
        console.log(response)
    });

    // Save the collected reviews data to a JSON file
    fs.writeFileSync('intercepted_reviews.json', JSON.stringify({reviewsData, host, keyNIds}, null, 3));
    console.log("Reviews data saved to intercepted_reviews.json");
}

main();
