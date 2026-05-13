const initialChapters = [
    {
        id: "c1",
        title: "1. Osnovni pojmovi IKT",
        description: "Uvod u svet računara, hardver, softver i bezbedno korišćenje tehnologije.",
        icon: "monitor",
        lessons: [
            {
                id: "l1_1",
                title: "Uvod u IKT i digitalni svet",
                description: "Šta je to IKT i zašto nam je važan?",
                textContent: "Informaciono-komunikacione tehnologije (IKT) obuhvataju sve uređaje i programe koji nam pomažu da obrađujemo informacije. U današnjem svetu, skoro sve što radimo povezano je sa IKT. Od mobilnih telefona do pametnih kuća, tehnologija je svuda oko nas.\n\nHardver su fizički, opipljivi delovi računara (ono što možemo dodirnuti), dok je softver nevidljivi deo, odnosno programi koji govore hardveru kako da se ponaša.",
                videoUrl: "",
                pdfUrl: "",
                keyPoints: [
                    "IKT povezuje uređaje i ljude",
                    "Hardver je opipljiv (monitor, miš)",
                    "Softver su programi (Windows, Chrome)",
                    "Pravilno sedenje čuva zdravlje"
                ],
                quiz: [
                    {
                        question: "Šta od navedenog spada u hardver?",
                        options: ["Operativni sistem", "Monitor", "Google Chrome", "Video igra"],
                        correctAnswer: 1
                    },
                    {
                        question: "Koliko često treba praviti pauze pri radu na računaru?",
                        options: ["Svakih 5 sati", "Nikada", "Svakih 30 minuta", "Jednom dnevno"],
                        correctAnswer: 2
                    },
                    {
                        question: "Šta je softver?",
                        options: ["Tastatura", "Procesor", "Programi na računaru", "Miš"],
                        correctAnswer: 2
                    }
                ]
            }
        ]
    },
    {
        id: "c2",
        title: "2. Operativni sistem i fajlovi",
        description: "Naučite kako da organizujete svoje podatke koristeći fajlove i foldere.",
        icon: "folder-tree",
        lessons: [
            {
                id: "l2_1",
                title: "Upravljanje fajlovima i folderima",
                description: "Organizacija digitalnog prostora.",
                textContent: "Operativni sistem (OS) je 'glavni šef' na računaru. On upravlja hardverom i omogućava drugim programima da rade. Bez njega, računar ne bi znao kako da reaguje na tvoje komande.\n\nPodatke na računaru čuvamo u fajlovima (slike, dokumenti), a radi bolje preglednosti ih grupišemo u foldere (fascikle).",
                videoUrl: "",
                pdfUrl: "",
                keyPoints: [
                    "OS je najvažniji program na računaru",
                    "Fajl je osnovna jedinica zapisa",
                    "Folderi služe za organizaciju",
                    "Ekstenzije nam govore o tipu fajla"
                ],
                quiz: [
                    {
                        question: "Koji program upravlja radom celog računara?",
                        options: ["Paint", "Operativni sistem", "Kalkulator", "Igra Solitaire"],
                        correctAnswer: 1
                    },
                    {
                        question: "U čemu čuvamo grupisane fajlove?",
                        options: ["U kanti za smeće", "U folderima", "U procesoru", "U monitoru"],
                        correctAnswer: 1
                    },
                    {
                        question: "Šta nam govori ekstenzija .jpg?",
                        options: ["Da je u pitanju tekst", "Da je u pitanju zvuk", "Da je u pitanju slika", "Da je u pitanju virus"],
                        correctAnswer: 2
                    }
                ]
            }
        ]
    },
    {
        id: "c3",
        title: "3. Internet i komunikacija",
        description: "Bezbedno pretraživanje interneta i pravila ponašanja u digitalnom svetu.",
        icon: "globe",
        lessons: [
            {
                id: "l3_1",
                title: "Bezbednost na internetu",
                description: "Kako se zaštititi u digitalnom svetu.",
                textContent: "Internet je ogromna mreža koja povezuje ljude širom planete. Da bismo 'krstarili' internetom, koristimo veb-pregledače kao što su Chrome, Firefox ili Edge.\n\nVeoma je važno poštovati pravila ponašanja (Netikeciju) i nikada ne deliti lične podatke sa nepoznatima.",
                videoUrl: "",
                pdfUrl: "",
                keyPoints: [
                    "Internet je globalna mreža",
                    "Pregledači (browsers) otvaraju sajtove",
                    "Netikecija su pravila lepog ponašanja",
                    "Privatnost je najvažnija"
                ],
                quiz: [
                    {
                        question: "Šta od navedenog NIJE veb-pregledač?",
                        options: ["Google Chrome", "Mozilla Firefox", "Windows 10", "Microsoft Edge"],
                        correctAnswer: 2
                    },
                    {
                        question: "Šta na internetu znači pisanje isključivo VELIKIM SLOVIMA?",
                        options: ["Naglašavanje važnosti", "Vikanje", "Lepo ponašanje", "Šaputanje"],
                        correctAnswer: 1
                    },
                    {
                        question: "Koji podatak smeš podeliti sa nepoznatom osobom na internetu?",
                        options: ["Svoju lozinku", "Svoju kućnu adresu", "Omiljenu boju", "Broj telefona roditelja"],
                        correctAnswer: 2
                    }
                ]
            }
        ]
    },
    {
        id: "c4",
        title: "4. Algoritmi i Scratch",
        description: "Prvi koraci u programiranju kroz vizuelne blokove.",
        icon: "code-2",
        lessons: [
            {
                id: "l4_1",
                title: "Uvod u algoritamsko razmišljanje",
                description: "Rešavanje problema korak po korak.",
                textContent: "Programiranje je način rešavanja problema davanjem instrukcija računaru. Algoritam je precizan recept ili niz koraka koji vodi do rešenja.\n\nScratch je zabavna platforma gde programiramo slažući šarene blokove kao Lego kocke.",
                videoUrl: "",
                pdfUrl: "",
                keyPoints: [
                    "Algoritam je niz koraka",
                    "Programiranje je rešavanje problema",
                    "U Scratch-u koristimo blokove",
                    "Likovi se zovu Sprite-ovi"
                ],
                quiz: [
                    {
                        question: "Šta je algoritam?",
                        options: ["Deo hardvera", "Niz koraka za rešavanje zadatka", "Vrsta monitora", "Ime virusa"],
                        correctAnswer: 1
                    },
                    {
                        question: "Kako se u Scratch-u nazivaju likovi koji izvršavaju komande?",
                        options: ["Blokovi", "Skripte", "Sprite-ovi (Likovi)", "Pozornice"],
                        correctAnswer: 2
                    },
                    {
                        question: "U kom obliku su komande u Scratch-u?",
                        options: ["Kao tekstualni kod", "Kao vizuelni blokovi", "Kao zvučni zapisi", "Kao slike"],
                        correctAnswer: 1
                    }
                ]
            }
        ]
    }
];
