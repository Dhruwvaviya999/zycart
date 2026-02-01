// Add new Product

import imagekit from "@/configs/imageKit";
import { prisma } from "@/lib/prisma";
import authSeller from "@/middlewares/authSeller";
import { getAuth } from "@clerk/nextjs/dist/types/server"
import { NextResponse } from "next/server";

export async function POST(request){
    try {

        const {userId} = getAuth(request);
        const storeId = await authSeller(userId);

        if(!storeId){
            return NextResponse.json({error: "not authorized"}, {status: 401});
        }

        // Get the data from the form
        const formData = await request.formData();
        const name = formData.get("name");
        const description = formData.get("description");
        const mrp = Number(formData.get("mrp"));;
        const price = Number(formData.get("price"));
        const category = formData.get("category");
        const images = formData.getAll("images");
        

        if(!name || !description || !mrp || !price || !category || images.length < 1){
            return NextResponse.json({error: "missing product details"}, {status: 400});
        }

        // Uploading Images to Imagekit
        const imnageUrl = await Promise.all(images.map(async (image) => {
            const buffer = buffer.from(await image.arrayBuffer());
            const response = await imagekit.upload({
                file: buffer,
                fileName: image.name,
                folder: "products",
            })
            const url = imagekit.url({
                path: response.filePath,
                transformation: [
                    {quality: "auto"},
                    {format: "webp"},
                    {with: "1024"},
                ]
            })
            return url;
        }))


        await prisma.product.create({
            data:{
                name,
                description,
                mrp,
                price,
                category,
                images: imnageUrl,
                storeId
            }
        })

        return NextResponse.json({message: "Product added successfully"}, {status: 201});

    } catch (error) {
        console.log(error);
        return NextResponse.json({error: error.code || error.message}, {status: 500})
    }
}


// Get all products of a store
export async function GET(request){
    try {
        const { userId } = getAuth(request);
        const storeId = await authSeller(userId);

        if(!storeId){
            return NextResponse.json({error: "not authorized"}, { status: 401 });
        }
        const products = await prisma.product.findMany({ where: {storeId}});

        return NextResponse.json({products});
        
    } catch (error) {
        console.log(error);
        return NextResponse.json({error: error.code || error.message}, {status: 400});
    }
}