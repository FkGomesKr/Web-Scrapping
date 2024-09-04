import puppeteer, { Browser } from "puppeteer-core";
import * as fs from 'fs';


const url = "https://books.toscrape.com/";

const main = async () => {
    const browser: Browser = await puppeteer.launch({ 
        headless: true,
        executablePath: '/opt/google/chrome/google-chrome' 
    });
    const page = await browser.newPage();
    await page.goto(url);

    const bookData = await page.evaluate((url) => {

        const bookPods = Array.from(document.querySelectorAll('.product_pod'));
        
        const convertPrice = (price : string) => {
            return parseFloat(price.replace('£', ''));
        }

        const convertRating = (rating: string) => {
            if (!rating.localeCompare("One")) return 1;
            if (!rating.localeCompare("Two")) return 2;
            if (!rating.localeCompare("Three")) return 3;
            if (!rating.localeCompare("Four")) return 4;
            if (!rating.localeCompare("Five")) return 5;
            return 0;
        }

        const data = bookPods.map((book: any) => ({
            title: book.querySelector('h3 a').getAttribute('title'),
            price: convertPrice(book.querySelector('.price_color').innerText),
            imgSrc: url + book.querySelector('img').getAttribute('src'),
            rating: convertRating(book.querySelector('.star-rating').classList[1])
        }));

        return data;
        }, url)

    await browser.close();

    fs.writeFile('data.json', JSON.stringify(bookData), (err:any) => {
        if(err) throw err
        console.log("Sucessfuly saved JSON!")
    })
}

main()