
import { PineconeClient } from "@pinecone-database/pinecone";
import { Configuration, OpenAIApi } from "openai";
import { customAlphabet } from 'nanoid'
const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 10)
import questions from '../data/questions.json' assert {type: 'json'};

import { client } from './../mongodb.mjs'
const faqCollection = client.db("chatbotDB").collection("faqs");


const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);



const pinecone = new PineconeClient();
await pinecone.init({
    environment: process.env.PINECONE_ENVIRONMENT,
    apiKey: process.env.PINECONE_API_KEY,
});


// // will always be created form pine cone dashboard, 
// // it takes so much time like hours to initialize, 
// // maybe because of free version

// console.log(
//     await pinecone.createIndex({
//         createRequest: {
//             name: process.env.PINECONE_INDEX_NAME,
//             dimension: 1536,
//         },
//     })
// )



const insertSingleDocumentIntoMongodb = async (text) => {
    // since pine cone can only store data in vector form (numeric representation of text)
    // we will have to convert text data into vector of a certain dimension (1536 in case of openai)
    const response = await openai.createEmbedding({
        model: "text-embedding-ada-002",
        input: text,
    });
    const vector = response?.data?.data[0]?.embedding
    console.log("vector: ", vector);
    // [ 0.0023063174, -0.009358601, 0.01578391, ... , 0.01678391, ]

    try {
        const insertResponse = await faqCollection.insertOne({
            text: text,
            plot_embedding: vector,
            createdOn: new Date(),
        });

        console.log("insertResponse: ", insertResponse);
        return insertResponse;
    } catch (e) {
        console.log("error inserting mongodb: ", e);
    }
}
// insertSingleDocumentIntoPinecone("this is some text data to be inserted into pinecone index")



const insertMultipleDocumentIntoPinecone = async (questionsJsonArr) => {

    const allQuestionEmbeddingRequests = questionsJsonArr.map((eachQuestion, index) => {
        return openai.createEmbedding({
            model: "text-embedding-ada-002",
            input: `!!! question: ${eachQuestion.question} ### answer:${eachQuestion.answer} $$$`.trim().replaceAll('\n', ' ') // removing all line breaks
        });
    })
    console.log("converting all questions into vector with openai embedding... please wait");
    const allQuestionsVector = await Promise.all(allQuestionEmbeddingRequests)

    const allDocs = [];

    console.log("allQuestionsVector: ", allQuestionsVector);

    allQuestionsVector.map(eachVectorResponse => {

        const originalText = JSON.parse(eachVectorResponse.config.data).input
        const vectorRepresentation = eachVectorResponse?.data?.data[0]?.embedding

        console.log("originalText: ", originalText);
        console.log("vectorRepresentation: ", vectorRepresentation);

        allDocs.push({
            text: originalText,
            createdOn: new Date(),
            plot_embedding: vectorRepresentation,
        })
    })

    console.log("inserting all vectors into mongodb vector database... please wait");

    const upsertResponse = await faqCollection.insertMany(allDocs)
    console.log("upsertResponse: ", upsertResponse);
    return upsertResponse;
}
insertMultipleDocumentIntoPinecone(questions);


const deleteAllVectorsOfIndex = async () => {
    // https://docs.pinecone.io/docs/node-client#delete-vectors

    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
    const deleteResponse = await index.delete1({
        deleteAll: true,
        namespace: process.env.PINECONE_NAME_SPACE
    })
    console.log("deleteResponse: ", deleteResponse);

}
// deleteAllVectorsOfIndex();

const queryPineconeIndex = async (queryText, numberOfResults) => {

    const response = await openai.createEmbedding({
        model: "text-embedding-ada-002",
        input: queryText,
    });
    const vector = response?.data?.data[0]?.embedding
    console.log("vector: ", vector);
    // [ 0.0023063174, -0.009358601, 0.01578391, ... , 0.01678391, ]

    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
    const queryResponse = await index.query({
        queryRequest: {
            vector: vector,
            // id: "vec1",
            topK: numberOfResults,
            includeValues: true,
            includeMetadata: true,
            namespace: process.env.PINECONE_NAME_SPACE
        }
    });

    queryResponse.matches.map(eachMatch => {
        console.log(`score ${eachMatch.score.toFixed(1)} => ${JSON.stringify(eachMatch.metadata)}\n\n`);
    })
    console.log(`${queryResponse.matches.length} records found `);
}

// queryPineconeIndex("fsdfsdfsdf", 100)






const getIndexStats = async () => {

    const indexesList = await pinecone.listIndexes();
    console.log("indexesList: ", indexesList);

    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
    const indexStats = await index.describeIndexStats({
        describeIndexStatsRequest: {
            filter: {},
        },
    });
    console.log("indexStats: ", indexStats);
}
    // getIndexStats()



