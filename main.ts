import { Plugin, Notice } from 'obsidian';
import { marked } from 'marked';
import axios from 'axios'

interface IAnkiTable { 
    [key: string]: string; 
}

const ANKI_CONNECT_ENDPOINT = 'http://localhost:8765';

async function createAnkiNote(deck: string, cardContent: IAnkiTable) {
    try {
        const requestData = {
            action: "addNote",
            version: 6,
            params: {
                note: {
                    deckName: deck,
                    modelName: "Obsidian",
                    fields: cardContent
                }
            }
        };
        console.log(requestData);
        const response = await axios.post(ANKI_CONNECT_ENDPOINT, requestData);
        return response
    } catch (error) {
        console.error(error);
    }
}

async function updateAnkiNote(id: number, cardContent: IAnkiTable) {
    try {
        const requestData = {
            action: "updateNote",
            version: 6,
            params: {
                note: {
                    id: id,
                    fields: cardContent
                }
            }
        };
        console.log(requestData);
        const response = await axios.post(ANKI_CONNECT_ENDPOINT, requestData);
        return response
    } catch (error) {
        console.error(error);
    }
}

async function findAnkiNote(id: string): Promise<number> {
    try {
        const requestData = {
            action: "findNotes",
            version: 6,
            params: {
                query: `ID:${id}`
            }
        };
        const response = await axios.post(ANKI_CONNECT_ENDPOINT, requestData);
        if (response.status === 200) {
            if(response.data["result"].length) {
                return response.data["result"][0];
            }
        }
        return 0;
    } catch (error) {
        console.error(error);
        return 0;
    }
}

async function isDeckExist(deckName: string): Promise<boolean> {
    try {
        const requestData = {
            action: "deckNames",
            version: 6
        };
        const response = await axios.post(ANKI_CONNECT_ENDPOINT, requestData);
        if (response.status === 200) {
            const deckNames = response.data['result'];
            for (let i=0; i < deckNames.length; i++) {
                if (deckNames[i] === deckName) {
                    return true;
                }
            }
        }
        return false;
    } catch (error) {
        console.error(error);
        return false;
    }
}

async function createDeck(deckName: string): Promise<void> {
    try {
        const requestData = {
            action: "createDeck",
            version: 6, 
            params: {
                deck: deckName
            }
        };
        console.log(requestData);
        const response =  await axios.post(ANKI_CONNECT_ENDPOINT, requestData);
        if (response.status === 200) {
            console.log(`Created deck: ${deckName}`)
        }
    } catch (error) {
        console.error(error);
    }
}

function convertMarkdownToHTML(input: string): string {
    // Convert **text** to <b>text</b>
    let  converted = input.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

    // Convert *text* to <b>text</b>
    converted = converted.replace(/\*(.*?)\*/g, '<i>$1</i>');

    // Convert _text_ to <i>text</i>
    converted = converted.replace(/_(.*?)_/g, '<i>$1</i>');

    return converted;
}

function trimMarkdownStyle(input: string): string {
    // trim **text**
    let converted = input.replace(/\*\*(.*?)\*\*/g, '$1');

    // trim _text_
    converted = converted.replace(/_(.*?)_/g, '$1');

    return converted;
}

export default class AnkiPlugin extends Plugin {


    onload(): void {
        console.log("AnkiPlugin")
        this.addCommand({
            id: "export-table-to-anki",
            name: "Export table to Anki",
            callback: async () => {
                const currActiveFile = this.app.workspace.getActiveFile();
                if (currActiveFile) {
                    const fileURL = `obsidian://open?vault=${encodeURIComponent(this.app.vault.getName())}&file=${encodeURIComponent(currActiveFile.path)}`;

                    // extract target deck
                    const content = await this.app.vault.read(currActiveFile);
                    const deckMatch = content.match(/deck:\s(.*?)\n/);
                    let targetDeck = "";
                    if (deckMatch) {
                        targetDeck = deckMatch[1];
                        console.log("Target Deck:", targetDeck);
                    } else {
                        console.log("Deck field not found");
                    }

                    const tokens = marked.lexer(content);

                    tokens.forEach(token => {
                        if (token.type === 'table') {
                            console.log(token);
                            const tableContent: Array<IAnkiTable> = [];
                            const wordlist: Array<string> = [];
                            token.rows.forEach((term: Array<{ text: string, tokens?: [] }>) => {
                                const tableRow: { [key: string]: string } = {};
                                for (let i = 0; i < token.header.length; i++) {
                                    if (token.header[i].text === 'Word') {
                                        if (term[i].text === '') {
                                            term[i].text = tableContent[tableContent.length - 1][token.header[i].text]
                                        } else {
                                            wordlist.push(trimMarkdownStyle(term[i].text));
                                        }
                                        
                                        tableRow[token.header[i].text] = trimMarkdownStyle(term[i].text);

                                    } else {
                                        tableRow[token.header[i].text] = convertMarkdownToHTML(term[i].text);
                                    }
                                }
                                tableRow['Obsidian'] = fileURL;
                                tableContent.push(tableRow);
                            })
                            // console.log(tableContent);
                            // console.log(isDeckExist(targetDeck))
                            isDeckExist(targetDeck).then(result => {
                                if(!result) {
                                    createDeck(targetDeck);
                                }
                                tableContent.forEach(term => {
                                    // create related field for multiple choices
                                    term["Related"] = wordlist.filter((item) => item !== term["Word"]).join(", ");
                                    term["Logo"] = "<img class='obsidian' src='obsidian-logo.png'>";
                                    findAnkiNote(term["ID"]).then(id => {
                                        if(id) {
                                            updateAnkiNote(id, term);
                                        } else {
                                            createAnkiNote(targetDeck, term);
                                        }
                                    })
                                    
                                })
                                new Notice(`Sync ${tableContent.length} notes to Anki!`)
                            })
                        }
                    });

                }
            }
        })
    }
}
