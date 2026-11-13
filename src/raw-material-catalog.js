// Rohstoff-Katalog: in der EU zugelassene Lebensmittelzusatzstoffe (E-Nummern) + gängige Getränke-Grundstoffe.
// Quelle E-Nummern: https://de.wikipedia.org/wiki/Liste_der_Lebensmittelzusatzstoffe
// (Basis VO (EG) Nr. 1333/2008, Stand der Quelle August 2021). Nicht mehr zugelassene Stoffe (z. B. E 171) fehlen.
// Hinweis: Referenzliste ohne Gewähr – Verwendungsbeschränkungen und Höchstmengen je Lebensmittelkategorie
// gelten weiterhin nach Anhang II der Verordnung und müssen fachlich geprüft werden.

export const catalogSource = 'EU-Zusatzstoffliste (VO 1333/2008, Stand der Quelle 08/2021) · Wikipedia'

const additiveData = `E 100	Curcumin	Farbstoff
E 101	Riboflavin (Riboflavin-5-phosphat)	Farbstoff
E 102	Tartrazin	Farbstoff
E 104	Chinolingelb	Farbstoff
E 110	Gelborange S	Farbstoff
E 120	Karmin (Echtes Karmin)	Farbstoff
E 122	Azorubin	Farbstoff
E 123	Amaranth	Farbstoff
E 124	Cochenillerot A	Farbstoff
E 127	Erythrosin	Farbstoff
E 129	Allurarot AC	Farbstoff
E 131	Patentblau V	Farbstoff
E 132	Indigotin I	Farbstoff
E 133	Brillantblau FCF	Farbstoff
E 140	Chlorophyll und Chlorophylline	Farbstoff
E 141	Kupferhaltige Komplexe der Chlorophylle und Chlorophylline	Farbstoff
E 142	Grün S	Farbstoff
E 150a	Einfaches Zuckerkulör	Farbstoff
E 150b	Sulfitlaugen-Zuckerkulör	Farbstoff
E 150c	Ammoniak-Zuckerkulör	Farbstoff
E 150d	Ammonsulfit-Zuckerkulör	Farbstoff
E 151	Brillantschwarz BN	Farbstoff
E 153	Pflanzenkohle	Farbstoff
E 155	Braun HT	Farbstoff
E 160a	Carotin	Farbstoff
E 160b	Annatto (Bixin, Norbixin)	Farbstoff
E 160c	Paprikaextrakt	Farbstoff
E 160d	Lycopin	Farbstoff
E 160e	Beta-apo-8-Carotinal	Farbstoff
E 161b	Lutein	Farbstoff
E 161g	Canthaxanthin	Farbstoff
E 162	Betanin	Farbstoff
E 163	Anthocyane	Farbstoff
E 170	Calciumcarbonat	Farbstoff
E 172	Eisenoxide und Eisenhydroxide	Farbstoff
E 173	Aluminium	Farbstoff
E 174	Silber	Farbstoff
E 175	Gold	Farbstoff
E 180	Litholrubin BK	Farbstoff
E 579	Eisengluconat	Farbstoff
E 585	Eisenlactat	Farbstoff
E 200	Sorbinsäure	Konservierungsstoff
E 202	Kaliumsorbat	Konservierungsstoff
E 210	Benzoesäure	Konservierungsstoff
E 211	Natriumbenzoat	Konservierungsstoff
E 212	Kaliumbenzoat	Konservierungsstoff
E 213	Calciumbenzoat	Konservierungsstoff
E 214	4-Hydroxybenzoesäureethylester	Konservierungsstoff
E 215	Natrium-4-hydroxybenzoesäureethylester	Konservierungsstoff
E 218	4-Hydroxybenzoesäuremethylester	Konservierungsstoff
E 219	Natrium-4-hydroxybenzoesäuremethylester	Konservierungsstoff
E 220	Schwefeldioxid	Konservierungsstoff
E 221	Natriumsulfit	Konservierungsstoff
E 222	Natriumhydrogensulfit	Konservierungsstoff
E 223	Natriumdisulfit	Konservierungsstoff
E 224	Kaliumdisulfit	Konservierungsstoff
E 226	Calciumsulfit	Konservierungsstoff
E 227	Calciumhydrogensulfit	Konservierungsstoff
E 228	Kaliumhydrogensulfit	Konservierungsstoff
E 234	Nisin	Konservierungsstoff
E 235	Natamycin	Konservierungsstoff
E 239	Hexamethylentetramin	Konservierungsstoff
E 242	Dimethyldicarbonat	Konservierungsstoff
E 243	Ethyllaurylarginat	Konservierungsstoff
E 249	Kaliumnitrit	Konservierungsstoff
E 250	Natriumnitrit	Konservierungsstoff
E 251	Natriumnitrat	Konservierungsstoff
E 252	Kaliumnitrat	Konservierungsstoff
E 260	Essigsäure	Konservierungsstoff
E 261	Kaliumacetat	Säureregulator
E 262	Natriumacetate	Säureregulator
E 263	Calciumacetat	Säureregulator
E 270	Milchsäure	Säuerungsmittel
E 280	Propionsäure	Konservierungsstoff
E 281	Natriumpropionat	Konservierungsstoff
E 282	Calciumpropionat	Konservierungsstoff
E 283	Kaliumpropionat	Konservierungsstoff
E 284	Borsäure	Konservierungsstoff
E 285	Natriumtetraborat	Konservierungsstoff
E 290	Kohlendioxid (Kohlensäure)	Packgas
E 296	Äpfelsäure	Säuerungsmittel
E 297	Fumarsäure	Säuerungsmittel
E 300	Ascorbinsäure	Antioxidationsmittel
E 301	Natriumascorbat	Antioxidationsmittel
E 302	Calciumascorbat	Antioxidationsmittel
E 303	Ascorbyldiacetat	Antioxidationsmittel
E 304	Ascorbylpalmitat	Antioxidationsmittel
E 305	Ascorbylstearat	Antioxidationsmittel
E 306	Tocopherolhaltige Extrakte	Antioxidationsmittel
E 307a	d-α-Tocopherol	Antioxidationsmittel
E 307b	α-Tocopherol, Konzentrat gemischt	Antioxidationsmittel
E 307c	d/l-α-Tocopherol	Antioxidationsmittel
E 308	γ-Tocopherol, synthetisch	Antioxidationsmittel
E 309	δ-Tocopherol, synthetisch	Antioxidationsmittel
E 310	Propylgallat	Antioxidationsmittel
E 315	Isoascorbinsäure	Antioxidationsmittel
E 316	Natriumisoascorbat	Antioxidationsmittel
E 319	tert-Butylhydrochinon (TBHQ)	Antioxidationsmittel
E 320	Butylhydroxyanisol (BHA)	Antioxidationsmittel
E 321	Butylhydroxytoluol (BHT)	Antioxidationsmittel
E 322	Lecithin	Emulgator
E 325	Natriumlactat	Säureregulator
E 326	Kaliumlactat	Säureregulator
E 327	Calciumlactat	Säureregulator
E 330	Citronensäure	Säuerungsmittel
E 331	Natriumcitrate	Säureregulator
E 332	Kaliumcitrate	Säureregulator
E 333	Calciumcitrate	Säureregulator
E 334	L-(+)-Weinsäure	Säuerungsmittel
E 335	Natriumtartrate	Säureregulator
E 336	Kaliumtartrate	Säureregulator
E 337	Kaliumnatriumtartrat	Säureregulator
E 338	Phosphorsäure	Säuerungsmittel
E 339	Natriumphosphate	Säureregulator
E 340	Kaliumphosphate	Säureregulator
E 341	Calciumphosphate	Säureregulator
E 343	Magnesiumphosphate	Trennmittel
E 350	Natriummalate	Säureregulator
E 351	Kaliummalat	Säureregulator
E 352	Calciummalate	Säureregulator
E 353	Metaweinsäure	Stabilisator
E 354	Calciumtartrat	Komplexbildner
E 355	Adipinsäure	Säureregulator
E 356	Natriumadipat	Säureregulator
E 357	Kaliumadipat	Säureregulator
E 363	Bernsteinsäure	Säuerungsmittel
E 380	Ammoniumcitrat	Säureregulator
E 385	Calciumdinatriumethylendiamintetraacetat	Komplexbildner
E 392	Rosmarinextrakt	Antioxidationsmittel
E 400	Alginsäure	Geliermittel
E 401	Natriumalginat	Geliermittel
E 402	Kaliumalginat	Geliermittel
E 403	Ammoniumalginat	Geliermittel
E 404	Calciumalginat	Geliermittel
E 405	Propylenglycolalginat	Emulgator
E 406	Agar-Agar	Geliermittel
E 407	Carrageen	Geliermittel
E 407a	Verarbeitete Eucheuma-Algen	Geliermittel
E 410	Johannisbrotkernmehl	Verdickungsmittel
E 412	Guarkernmehl	Verdickungsmittel
E 413	Traganth	Verdickungsmittel
E 414	Gummi arabicum	Stabilisator
E 415	Xanthan	Verdickungsmittel
E 416	Karaya	Verdickungsmittel
E 417	Tarakernmehl	Verdickungsmittel
E 418	Gellan	Geliermittel
E 420	Sorbit	Süßungsmittel
E 421	Mannit	Süßungsmittel
E 422	Glycerin	Feuchthaltemittel
E 423	Octenylbernsteinsäuremodifiziertes Gummi arabicum	Emulgator
E 425	Konjak	Verdickungsmittel
E 426	Sojabohnen-Polyose	Emulgator
E 427	Cassiagummi	Geliermittel
E 432	Polyoxyethylen-sorbitan-monolaurat	Emulgator
E 433	Polyoxyethylen-sorbitan-monooleat	Emulgator
E 434	Polyoxyethylen-sorbitan-monopalmitat	Emulgator
E 435	Polyoxyethylen-sorbitan-monostearat	Emulgator
E 436	Polyoxyethylen-sorbitan-tristearat	Emulgator
E 440	Pektine (amidiertes Pektin)	Geliermittel
E 442	Ammoniumsalze der Phosphatidsäure	Emulgator
E 444	Saccharoseacetatisobutyrat (SAIB)	Stabilisator
E 445	Glycerinester aus Wurzelharz	Stabilisator
E 450	Diphosphate	Komplexbildner
E 451	Triphosphate	Komplexbildner
E 452	Polyphosphate	Komplexbildner
E 456	Kaliumpolyaspartat	Stabilisator
E 459	beta-Cyclodextrin	Komplexbildner
E 460	Cellulose (mikrokristalline Cellulose, Cellulosepulver)	Füllstoff
E 461	Methylcellulose	Verdickungsmittel
E 462	Ethylcellulose	Verdickungsmittel
E 463	Hydroxypropylcellulose	Emulgator
E 463a	Niedrig substituierte Hydroxypropylcellulose (L-HPC)	Sonstiges
E 464	Hydroxypropylmethylcellulose	Emulgator
E 465	Ethylmethylcellulose	Füllstoff
E 466	Natriumcarboxymethylcellulose	Verdickungsmittel
E 468	Vernetzte Natriumcarboxymethylcellulose	Füllstoff
E 469	Enzymatisch hydrolysierte Natriumcarboxymethylcellulose	Füllstoff
E 470	Salze der Speisefettsäuren (Al, NH4, Na, K, Ca)	Emulgator
E 470a	Natrium-, Kalium- und Calcium-Salze von Speisefettsäuren	Emulgator
E 470b	Magnesiumsalz von Speisefettsäuren	Trennmittel
E 471	Mono- und Diglyceride von Speisefettsäuren	Emulgator
E 472a	Essigsäureester von Mono- und Diglyceriden	Emulgator
E 472b	Milchsäureester von Mono- und Diglyceriden	Emulgator
E 472c	Citronensäureester von Mono- und Diglyceriden	Emulgator
E 472d	Weinsäureester von Mono- und Diglyceriden	Emulgator
E 472e	Mono- und Diacetylweinsäureester von Mono- und Diglyceriden	Emulgator
E 472f	Gemischte Wein- und Essigsäureester von Mono- und Diglyceriden	Emulgator
E 473	Zuckerester von Speisefettsäuren	Emulgator
E 474	Zuckerglyceride	Emulgator
E 475	Polyglycerinester von Speisefettsäuren	Emulgator
E 476	Polyglycerin-Polyricinoleat	Emulgator
E 477	Propylenglycolester von Speisefettsäuren	Emulgator
E 479b	Thermooxidiertes Sojaöl, mit Mono- und Diglyceriden verestert	Emulgator
E 481	Natriumstearoyl-2-lactylat	Emulgator
E 482	Calciumstearoyl-2-lactylat	Emulgator
E 483	Stearyltartrat	Emulgator
E 491	Sorbitanmonostearat	Emulgator
E 492	Sorbitantristearat	Emulgator
E 493	Sorbitanmonolaurat	Emulgator
E 494	Sorbitanmonooleat	Emulgator
E 495	Sorbitanmonopalmitat	Emulgator
E 499	Stigmasterinreiche Phytosterine	Emulgator
E 500	Natriumcarbonate	Backtriebmittel
E 501	Kaliumcarbonate	Backtriebmittel
E 503	Ammoniumcarbonate	Backtriebmittel
E 504	Magnesiumcarbonate	Säureregulator
E 507	Salzsäure	Säureregulator
E 508	Kaliumchlorid	Festigungsmittel
E 509	Calciumchlorid	Festigungsmittel
E 511	Magnesiumchlorid	Festigungsmittel
E 512	Zinn(II)-chlorid	Stabilisator
E 513	Schwefelsäure	Säuerungsmittel
E 514	Natriumsulfate	Säureregulator
E 515	Kaliumsulfate	Säureregulator
E 516	Calciumsulfat	Festigungsmittel
E 517	Ammoniumsulfat	Sonstiges
E 520	Aluminiumsulfat	Festigungsmittel
E 521	Aluminiumnatriumsulfat	Festigungsmittel
E 522	Aluminiumkaliumsulfat	Festigungsmittel
E 523	Aluminiumammoniumsulfat	Festigungsmittel
E 524	Natriumhydroxid	Säureregulator
E 525	Kaliumhydroxid	Säureregulator
E 526	Calciumhydroxid	Säureregulator
E 527	Ammoniumhydroxid	Säureregulator
E 528	Magnesiumhydroxid	Säureregulator
E 529	Calciumoxid	Säureregulator
E 530	Magnesiumoxid	Säureregulator
E 534	Eisentartrat	Trennmittel
E 535	Natriumferrocyanid	Trennmittel
E 536	Kaliumferrocyanid	Trennmittel
E 538	Calciumferrocyanid	Trennmittel
E 541	Saures Natriumaluminiumphosphat (SALP)	Backtriebmittel
E 551	Siliciumdioxid	Trennmittel
E 552	Calciumsilicat	Trennmittel
E 553a	Magnesiumsilicate	Trennmittel
E 553b	Talkum	Trennmittel
E 554	Natriumaluminiumsilicat	Trennmittel
E 555	Kaliumaluminiumsilicate	Trennmittel
E 570	Speisefettsäuren	Emulgator
E 574	Gluconsäure	Säuerungsmittel
E 575	Glucono-delta-lacton	Säureregulator
E 576	Natriumgluconat	Säureregulator
E 577	Kaliumgluconat	Säureregulator
E 578	Calciumgluconat	Festigungsmittel
E 586	4-Hexylresorcin	Antioxidationsmittel
E 620	Glutaminsäure	Geschmacksverstärker
E 621	Natriumglutamat	Geschmacksverstärker
E 622	Monokaliumglutamat	Geschmacksverstärker
E 623	Calciumdiglutamat	Geschmacksverstärker
E 624	Monoammoniumglutamat	Geschmacksverstärker
E 625	Magnesiumdiglutamat	Geschmacksverstärker
E 626	Guanylsäure	Geschmacksverstärker
E 627	Dinatriumguanylat	Geschmacksverstärker
E 628	Dikaliumguanylat	Geschmacksverstärker
E 629	Calciumguanylat	Geschmacksverstärker
E 630	Inosinsäure	Geschmacksverstärker
E 631	Dinatriuminosinat	Geschmacksverstärker
E 632	Dikaliuminosinat	Geschmacksverstärker
E 633	Calciuminosinat	Geschmacksverstärker
E 634	Calcium-5'-ribonucleotid	Geschmacksverstärker
E 635	Dinatrium-5'-ribonucleotid	Geschmacksverstärker
E 640	Glycin und dessen Natriumsalz	Geschmacksverstärker
E 641	L-Leucin	Geschmacksverstärker
E 650	Zinkacetat	Geschmacksverstärker
E 900	Polydimethylsiloxan (PDMS)	Schaumverhüter
E 901	Bienenwachs	Überzugsmittel
E 902	Candelillawachs	Überzugsmittel
E 903	Carnaubawachs	Überzugsmittel
E 904	Schellack	Überzugsmittel
E 905	Mikrowachs	Überzugsmittel
E 907	Hydriertes Poly-1-decen	Überzugsmittel
E 914	Polyethylenwachsoxidate	Überzugsmittel
E 920	L-Cystein	Mehlbehandlungsmittel
E 927b	Carbamid	Mehlbehandlungsmittel
E 938	Argon	Treibgas
E 939	Helium	Treibgas
E 941	Stickstoff	Packgas
E 942	Distickstoffmonoxid	Packgas
E 943a	Butan	Treibgas
E 943b	Isobutan	Treibgas
E 944	Propan	Treibgas
E 948	Sauerstoff	Packgas
E 949	Wasserstoff	Packgas
E 950	Acesulfam K	Süßungsmittel
E 951	Aspartam	Süßungsmittel
E 952	Cyclamat	Süßungsmittel
E 953	Isomalt	Süßungsmittel
E 954	Saccharin	Süßungsmittel
E 955	Sucralose	Süßungsmittel
E 957	Thaumatin	Süßungsmittel
E 959	Neohesperidin-Dihydrochalkon	Süßungsmittel
E 960a	Steviolglykoside (aus Stevia)	Süßungsmittel
E 960b	Steviolglykoside (durch Fermentation hergestellt)	Süßungsmittel
E 960c	Steviolglykoside (enzymatisch hergestellt)	Süßungsmittel
E 961	Neotam	Süßungsmittel
E 962	Aspartam-Acesulfam-Salz	Süßungsmittel
E 965	Maltit	Süßungsmittel
E 966	Lactitol	Süßungsmittel
E 967	Xylitol	Süßungsmittel
E 968	Erythrit	Süßungsmittel
E 969	Advantam	Süßungsmittel
E 999	Quillajaextrakt	Sonstiges
E 1103	Invertase	Feuchthaltemittel
E 1200	Polydextrose	Feuchthaltemittel
E 1201	Polyvinylpyrrolidon	Stabilisator
E 1202	Polyvinylpolypyrrolidon	Stabilisator
E 1203	Polyvinylalkohol	Überzugsmittel
E 1204	Pullulan	Überzugsmittel
E 1205	Basisches Methacrylat-Copolymer	Überzugsmittel
E 1206	Neutrales Methacrylat-Copolymer	Überzugsmittel
E 1207	Anionisches Methacrylat-Copolymer	Überzugsmittel
E 1208	Polyvinylpyrrolidon-Vinylacetat-Copolymer	Überzugsmittel
E 1209	Polyvinylalkohol-Polyethylenglycol-Pfropfcopolymer	Stabilisator
E 1404	Oxidierte Stärke	Modifizierte Stärke
E 1410	Monostärkephosphat	Modifizierte Stärke
E 1412	Distärkephosphat	Modifizierte Stärke
E 1413	Phosphatiertes Distärkephosphat	Modifizierte Stärke
E 1414	Acetyliertes Distärkephosphat	Modifizierte Stärke
E 1420	Acetylierte Stärke	Modifizierte Stärke
E 1422	Acetyliertes Distärkeadipat	Modifizierte Stärke
E 1440	Hydroxypropylstärke	Modifizierte Stärke
E 1442	Hydroxypropyldistärkephosphat	Modifizierte Stärke
E 1450	Stärkenatriumoctenylsuccinat	Modifizierte Stärke
E 1451	Acetylierte oxidierte Stärke	Modifizierte Stärke
E 1452	Stärkealuminiumoctenylsuccinat	Trennmittel
E 1505	Triethylcitrat	Sonstiges
E 1517	Glycerindiacetat	Sonstiges
E 1518	Glycerintriacetat	Feuchthaltemittel
E 1519	Benzylalkohol	Sonstiges
E 1520	1,2-Propandiol	Feuchthaltemittel
E 1521	Polyethylenglykol	Überzugsmittel`

// Gängige Getränke-Grundstoffe ohne E-Nummer (Name · Kategorie der Rohstoff-DB · Einkaufseinheit).
const baseData = `Wasser (Trinkwasser)	Wasser	l
Mineralwasser	Wasser	l
Zucker (Saccharose)	Zucker/Süßungsmittel	kg
Flüssigzucker	Zucker/Süßungsmittel	kg
Glucosesirup	Zucker/Süßungsmittel	kg
Glucose-Fructose-Sirup	Zucker/Süßungsmittel	kg
Fructose	Zucker/Süßungsmittel	kg
Dextrose (Traubenzucker)	Zucker/Süßungsmittel	kg
Rohrohrzucker	Zucker/Süßungsmittel	kg
Honig	Zucker/Süßungsmittel	kg
Agavendicksaft	Zucker/Süßungsmittel	kg
Zitronensaftkonzentrat	Saft/Konzentrat	l
Limettensaftkonzentrat	Saft/Konzentrat	l
Orangensaftkonzentrat	Saft/Konzentrat	l
Apfelsaftkonzentrat	Saft/Konzentrat	l
Traubensaftkonzentrat	Saft/Konzentrat	l
Himbeersaftkonzentrat	Saft/Konzentrat	l
Erdbeersaftkonzentrat	Saft/Konzentrat	l
Kirschsaftkonzentrat	Saft/Konzentrat	l
Johannisbeersaftkonzentrat (schwarz)	Saft/Konzentrat	l
Maracujasaftkonzentrat	Saft/Konzentrat	l
Mangopüree	Saft/Konzentrat	kg
Pfirsichpüree	Saft/Konzentrat	kg
Ananassaftkonzentrat	Saft/Konzentrat	l
Grapefruitsaftkonzentrat	Saft/Konzentrat	l
Holunderblütenextrakt	Aroma/Extrakt	l
Natürliches Aroma	Aroma/Extrakt	kg
Aroma	Aroma/Extrakt	kg
Natürliches Zitronenaroma	Aroma/Extrakt	kg
Natürliches Limettenaroma	Aroma/Extrakt	kg
Natürliches Orangenaroma	Aroma/Extrakt	kg
Grüntee-Extrakt	Aroma/Extrakt	kg
Ingwerextrakt	Aroma/Extrakt	kg
Guarana-Extrakt	Koffein	kg
Koffein	Koffein	kg
Taurin	Sonstiges	kg
L-Carnitin	Sonstiges	kg
Inositol	Sonstiges	kg
Glucuronolacton	Sonstiges	kg
Vitamin C (L-Ascorbinsäure)	Vitamine/Mineralstoffe	kg
Niacin (Vitamin B3)	Vitamine/Mineralstoffe	kg
Pantothensäure (Vitamin B5)	Vitamine/Mineralstoffe	kg
Vitamin B6	Vitamine/Mineralstoffe	kg
Vitamin B12	Vitamine/Mineralstoffe	kg
Biotin	Vitamine/Mineralstoffe	kg
Folsäure	Vitamine/Mineralstoffe	kg
Vitaminmischung (Premix)	Vitamine/Mineralstoffe	kg
Magnesiumcitrat	Vitamine/Mineralstoffe	kg
Zinkgluconat	Vitamine/Mineralstoffe	kg
Speisesalz (Natriumchlorid)	Sonstiges	kg
Ballaststoff Inulin	Sonstiges	kg
Natürliches Pfirsicharoma	Aroma/Extrakt	kg
Natürliches Maracujaaroma	Aroma/Extrakt	kg
Natürliches Pfirsich-Maracuja-Aroma	Aroma/Extrakt	kg
Natürliches Yuzuaroma	Aroma/Extrakt	kg
Natürliches Pink-Grapefruit-Aroma	Aroma/Extrakt	kg
Natürliches Grapefruitaroma	Aroma/Extrakt	kg
Natürliches Blutorangenaroma	Aroma/Extrakt	kg
Natürliches Mandarinenaroma	Aroma/Extrakt	kg
Natürliches Bergamottearoma	Aroma/Extrakt	kg
Natürliches Mangoaroma	Aroma/Extrakt	kg
Natürliches Ananasaroma	Aroma/Extrakt	kg
Natürliches Kokosaroma	Aroma/Extrakt	kg
Natürliches Litschiaroma	Aroma/Extrakt	kg
Natürliches Guavenaroma	Aroma/Extrakt	kg
Natürliches Drachenfruchtaroma	Aroma/Extrakt	kg
Natürliches Kiwiaroma	Aroma/Extrakt	kg
Natürliches Wassermelonenaroma	Aroma/Extrakt	kg
Natürliches Honigmelonenaroma	Aroma/Extrakt	kg
Natürliches Himbeeraroma	Aroma/Extrakt	kg
Natürliches Erdbeeraroma	Aroma/Extrakt	kg
Natürliches Heidelbeeraroma	Aroma/Extrakt	kg
Natürliches Brombeeraroma	Aroma/Extrakt	kg
Natürliches Aroma Schwarze Johannisbeere	Aroma/Extrakt	kg
Natürliches Kirscharoma	Aroma/Extrakt	kg
Natürliches Granatapfelaroma	Aroma/Extrakt	kg
Natürliches Cranberryaroma	Aroma/Extrakt	kg
Natürliches Apfelaroma	Aroma/Extrakt	kg
Natürliches Grüner-Apfel-Aroma	Aroma/Extrakt	kg
Natürliches Birnenaroma	Aroma/Extrakt	kg
Natürliches Traubenaroma	Aroma/Extrakt	kg
Natürliches Aprikosenaroma	Aroma/Extrakt	kg
Natürliches Holunderblütenaroma	Aroma/Extrakt	kg
Natürliches Ingweraroma	Aroma/Extrakt	kg
Natürliches Minzaroma	Aroma/Extrakt	kg
Natürliches Vanillearoma	Aroma/Extrakt	kg
Natürliches Cola-Aroma	Aroma/Extrakt	kg
Natürliches Eistee-Pfirsich-Aroma	Aroma/Extrakt	kg
Natürliches Rhabarberaroma	Aroma/Extrakt	kg
Natürliches Waldmeisteraroma	Aroma/Extrakt	kg
Natürliches Hibiskusaroma	Aroma/Extrakt	kg
Natürliches Tropical-Mix-Aroma	Aroma/Extrakt	kg
Natürliches Beeren-Mix-Aroma	Aroma/Extrakt	kg
Energy-Aroma (Tutti-Frutti)	Aroma/Extrakt	kg
Aroma Pfirsich (nicht natürlich)	Aroma/Extrakt	kg
Aroma Maracuja (nicht natürlich)	Aroma/Extrakt	kg
Aroma Mango (nicht natürlich)	Aroma/Extrakt	kg
Aroma Erdbeere (nicht natürlich)	Aroma/Extrakt	kg
Aroma Kirsche (nicht natürlich)	Aroma/Extrakt	kg
Aroma Zitrone-Limette (nicht natürlich)	Aroma/Extrakt	kg
Aroma Wassermelone (nicht natürlich)	Aroma/Extrakt	kg`

// Alltags- und Handelsnamen, damit die Suche auch „Zitronensäure“, „Vitamin C“, „Natron“ usw. findet.
const aliases = {
  'E 101': ['Vitamin B2'],
  'E 150a': ['Zuckercouleur', 'Karamell', 'Caramel'],
  'E 150b': ['Zuckercouleur', 'Karamell'],
  'E 150c': ['Zuckercouleur', 'Karamell'],
  'E 150d': ['Zuckercouleur', 'Karamell', 'Cola-Farbe'],
  'E 160a': ['Beta-Carotin', 'Betacarotin', 'Provitamin A'],
  'E 162': ['Rote-Bete-Rot', 'Rote Bete'],
  'E 163': ['Traubenschalenextrakt', 'Holunder', 'Schwarze Karotte'],
  'E 170': ['Kalk', 'Kreide'],
  'E 200': ['Sorbinsaeure'],
  'E 202': ['Sorbat', 'Kaliumsorbinat'],
  'E 211': ['Benzoat'],
  'E 212': ['Benzoat'],
  'E 220': ['Sulfit', 'Schwefel'],
  'E 242': ['Velcorin', 'DMDC'],
  'E 260': ['Essig'],
  'E 290': ['Kohlensäure', 'CO2', 'Kohlenstoffdioxid'],
  'E 296': ['Apfelsäure', 'Malic Acid'],
  'E 300': ['Vitamin C', 'L-Ascorbinsäure'],
  'E 301': ['Vitamin C'],
  'E 306': ['Vitamin E'],
  'E 307a': ['Vitamin E'],
  'E 307b': ['Vitamin E'],
  'E 307c': ['Vitamin E'],
  'E 322': ['Sojalecithin', 'Sonnenblumenlecithin'],
  'E 330': ['Zitronensäure', 'Citric Acid', 'Zitronensaeure'],
  'E 331': ['Natriumcitrat', 'Trinatriumcitrat', 'Zitrat'],
  'E 332': ['Kaliumcitrat', 'Trikaliumcitrat'],
  'E 333': ['Calciumcitrat'],
  'E 334': ['Weinsäure', 'Weinsteinsäure'],
  'E 338': ['Orthophosphorsäure'],
  'E 400': ['Alginat'],
  'E 414': ['Gummiarabikum', 'Akaziengummi', 'Gum Arabic'],
  'E 415': ['Xanthan Gum', 'Xanthangummi'],
  'E 418': ['Gellan Gum'],
  'E 420': ['Sorbitol'],
  'E 422': ['Glycerol', 'Glyzerin'],
  'E 440': ['Pektin'],
  'E 500': ['Natron', 'Backsoda', 'Natriumhydrogencarbonat', 'Soda'],
  'E 501': ['Pottasche'],
  'E 504': ['Magnesia'],
  'E 509': ['Calciumchlorid'],
  'E 551': ['Kieselsäure'],
  'E 575': ['GDL'],
  'E 621': ['Glutamat', 'MSG'],
  'E 900': ['Silikon-Entschäumer', 'Antischaummittel'],
  'E 941': ['N2'],
  'E 948': ['O2'],
  'E 950': ['Acesulfam-K', 'Ace-K'],
  'E 951': ['NutraSweet'],
  'E 955': ['Splenda'],
  'E 960a': ['Stevia', 'Rebaudiosid A'],
  'E 960b': ['Stevia'],
  'E 960c': ['Stevia'],
  'E 965': ['Maltitol'],
  'E 967': ['Xylit', 'Birkenzucker'],
  'E 968': ['Erythritol'],
  'E 1520': ['Propylenglykol', 'Propylenglycol', 'PG'],
  'Zucker (Saccharose)': ['Kristallzucker', 'Haushaltszucker', 'Raffinade', 'Weißzucker'],
  'Dextrose (Traubenzucker)': ['Glucose', 'Glukose'],
  'Glucosesirup': ['Glukosesirup'],
  'Glucose-Fructose-Sirup': ['Isoglucose', 'HFCS', 'Maissirup'],
  'Fructose': ['Fruchtzucker', 'Fruktose'],
  'Koffein': ['Coffein', 'Caffeine', 'Koffein wasserfrei'],
  'Wasser (Trinkwasser)': ['Leitungswasser', 'Brauchwasser'],
  'Maracujasaftkonzentrat': ['Passionsfrucht'],
  'Speisesalz (Natriumchlorid)': ['Salz', 'Kochsalz'],
  'Vitamin C (L-Ascorbinsäure)': ['Ascorbinsäure'],
  'Niacin (Vitamin B3)': ['Nicotinamid', 'Niacinamid'],
  // Aromasorten
  'Natürliches Pfirsicharoma': ['Pfirsich', 'Peach'],
  'Natürliches Maracujaaroma': ['Maracuja', 'Passionsfrucht', 'Passion Fruit'],
  'Natürliches Pfirsich-Maracuja-Aroma': ['Peach Maracuja', 'Pfirsich Maracuja'],
  'Natürliches Yuzuaroma': ['Yuzu'],
  'Natürliches Pink-Grapefruit-Aroma': ['Pink Grapefruit', 'Grapefruit'],
  'Natürliches Grapefruitaroma': ['Grapefruit', 'Pampelmuse'],
  'Natürliches Blutorangenaroma': ['Blutorange', 'Blood Orange'],
  'Natürliches Mandarinenaroma': ['Mandarine', 'Tangerine'],
  'Natürliches Bergamottearoma': ['Bergamotte'],
  'Natürliches Mangoaroma': ['Mango'],
  'Natürliches Ananasaroma': ['Ananas', 'Pineapple'],
  'Natürliches Kokosaroma': ['Kokos', 'Coconut'],
  'Natürliches Litschiaroma': ['Litschi', 'Lychee'],
  'Natürliches Guavenaroma': ['Guave', 'Guava'],
  'Natürliches Drachenfruchtaroma': ['Drachenfrucht', 'Pitaya', 'Dragonfruit'],
  'Natürliches Kiwiaroma': ['Kiwi'],
  'Natürliches Wassermelonenaroma': ['Wassermelone', 'Watermelon', 'Melone'],
  'Natürliches Honigmelonenaroma': ['Honigmelone', 'Melone'],
  'Natürliches Himbeeraroma': ['Himbeere', 'Raspberry'],
  'Natürliches Erdbeeraroma': ['Erdbeere', 'Strawberry'],
  'Natürliches Heidelbeeraroma': ['Heidelbeere', 'Blaubeere', 'Blueberry'],
  'Natürliches Brombeeraroma': ['Brombeere', 'Blackberry'],
  'Natürliches Aroma Schwarze Johannisbeere': ['Cassis', 'Johannisbeere', 'Blackcurrant'],
  'Natürliches Kirscharoma': ['Kirsche', 'Cherry'],
  'Natürliches Granatapfelaroma': ['Granatapfel', 'Pomegranate'],
  'Natürliches Cranberryaroma': ['Cranberry', 'Moosbeere'],
  'Natürliches Apfelaroma': ['Apfel', 'Apple'],
  'Natürliches Grüner-Apfel-Aroma': ['Grüner Apfel', 'Green Apple'],
  'Natürliches Birnenaroma': ['Birne', 'Pear'],
  'Natürliches Traubenaroma': ['Traube', 'Grape'],
  'Natürliches Aprikosenaroma': ['Aprikose', 'Marille', 'Apricot'],
  'Natürliches Holunderblütenaroma': ['Holunderblüte', 'Elderflower'],
  'Natürliches Ingweraroma': ['Ingwer', 'Ginger'],
  'Natürliches Minzaroma': ['Minze', 'Pfefferminze', 'Mint'],
  'Natürliches Vanillearoma': ['Vanille', 'Vanilla'],
  'Natürliches Cola-Aroma': ['Cola'],
  'Natürliches Eistee-Pfirsich-Aroma': ['Eistee', 'Ice Tea'],
  'Natürliches Rhabarberaroma': ['Rhabarber', 'Rhubarb'],
  'Natürliches Waldmeisteraroma': ['Waldmeister'],
  'Natürliches Hibiskusaroma': ['Hibiskus'],
  'Natürliches Tropical-Mix-Aroma': ['Tropical', 'Multifrucht', 'Tropic'],
  'Natürliches Beeren-Mix-Aroma': ['Beeren', 'Berry', 'Mixed Berry'],
  'Energy-Aroma (Tutti-Frutti)': ['Energy', 'Tutti Frutti', 'Bubblegum'],
  'Aroma Pfirsich (nicht natürlich)': ['Pfirsich', 'Peach'],
  'Aroma Maracuja (nicht natürlich)': ['Maracuja', 'Passionsfrucht'],
  'Aroma Mango (nicht natürlich)': ['Mango'],
  'Aroma Erdbeere (nicht natürlich)': ['Erdbeere'],
  'Aroma Kirsche (nicht natürlich)': ['Kirsche'],
  'Aroma Zitrone-Limette (nicht natürlich)': ['Zitrone', 'Limette', 'Lemon Lime'],
  'Aroma Wassermelone (nicht natürlich)': ['Wassermelone'],
}

// Richtpreise (€ netto je Einkaufseinheit des Katalogs, kg bzw. l): grobe Großhandelspreise für Getränkerohstoffe
// in Gebinden ab ca. 25 kg, Stand 11/2026. Nur zur Vorkalkulation – im Rohstoff durch den echten Lieferantenpreis ersetzen.
export const referencePriceDate = '11/2026'
const referencePrices = {
  // Säuerungsmittel / Säureregulatoren
  'E 330': 2.0, 'E 331': 2.5, 'E 332': 3.0, 'E 333': 4.0, 'E 334': 6.0, 'E 296': 3.0, 'E 270': 2.5, 'E 338': 2.0,
  'E 260': 1.5, 'E 500': 1.0, 'E 509': 3.0,
  // Antioxidationsmittel / Konservierung
  'E 300': 8.0, 'E 301': 9.0, 'E 202': 7.0, 'E 200': 9.0, 'E 211': 3.0, 'E 242': 40.0, 'E 392': 30.0,
  // Süßungsmittel
  'E 955': 60.0, 'E 950': 12.0, 'E 951': 18.0, 'E 954': 10.0, 'E 960a': 80.0, 'E 968': 3.5, 'E 967': 5.0,
  'E 420': 1.5, 'E 965': 4.0,
  // Farbstoffe (Getränke-Formulierungen, z. B. Emulsionen)
  'E 160a': 40.0, 'E 100': 40.0, 'E 101': 30.0, 'E 140': 30.0, 'E 141': 35.0, 'E 150a': 3.0, 'E 150d': 3.0,
  'E 160c': 30.0, 'E 162': 20.0, 'E 163': 25.0,
  // Stabilisatoren / Sonstiges
  'E 414': 8.0, 'E 415': 10.0, 'E 418': 40.0, 'E 440': 15.0, 'E 445': 12.0, 'E 466': 8.0, 'E 422': 2.0,
  'E 1520': 2.5, 'E 900': 15.0, 'E 290': 0.3, 'E 941': 0.5,
  // Grundstoffe
  'Wasser (Trinkwasser)': 0.005, 'Mineralwasser': 0.15,
  'Zucker (Saccharose)': 0.9, 'Flüssigzucker': 0.8, 'Glucosesirup': 0.9, 'Glucose-Fructose-Sirup': 0.7, 'Fructose': 2.0,
  'Dextrose (Traubenzucker)': 1.0, 'Rohrohrzucker': 2.0, 'Honig': 6.0, 'Agavendicksaft': 5.0,
  'Zitronensaftkonzentrat': 3.5, 'Limettensaftkonzentrat': 5.0, 'Orangensaftkonzentrat': 3.0, 'Apfelsaftkonzentrat': 2.0,
  'Traubensaftkonzentrat': 2.5, 'Himbeersaftkonzentrat': 9.0, 'Erdbeersaftkonzentrat': 6.0, 'Kirschsaftkonzentrat': 5.0,
  'Johannisbeersaftkonzentrat (schwarz)': 6.0, 'Maracujasaftkonzentrat': 8.0, 'Mangopüree': 2.5, 'Pfirsichpüree': 2.0,
  'Ananassaftkonzentrat': 3.0, 'Grapefruitsaftkonzentrat': 4.0,
  'Holunderblütenextrakt': 10.0, 'Natürliches Aroma': 30.0, 'Aroma': 20.0, 'Natürliches Zitronenaroma': 30.0,
  'Natürliches Limettenaroma': 30.0, 'Natürliches Orangenaroma': 30.0, 'Grüntee-Extrakt': 40.0, 'Ingwerextrakt': 35.0,
  'Guarana-Extrakt': 40.0, 'Koffein': 25.0, 'Taurin': 6.0, 'L-Carnitin': 25.0, 'Inositol': 15.0, 'Glucuronolacton': 30.0,
  'Vitamin C (L-Ascorbinsäure)': 8.0, 'Niacin (Vitamin B3)': 15.0, 'Pantothensäure (Vitamin B5)': 25.0, 'Vitamin B6': 40.0,
  'Vitamin B12': 60.0, 'Biotin': 50.0, 'Folsäure': 150.0, 'Vitaminmischung (Premix)': 60.0, 'Magnesiumcitrat': 8.0,
  'Zinkgluconat': 12.0, 'Speisesalz (Natriumchlorid)': 0.4, 'Ballaststoff Inulin': 5.0,
  // Weitere Zusatzstoffe (Getränke-relevant)
  'E 102': 20.0, 'E 104': 25.0, 'E 110': 20.0, 'E 120': 80.0, 'E 122': 25.0, 'E 124': 25.0, 'E 129': 25.0,
  'E 131': 30.0, 'E 132': 30.0, 'E 133': 25.0, 'E 150b': 3.0, 'E 150c': 3.0, 'E 153': 10.0, 'E 160b': 40.0,
  'E 160d': 60.0, 'E 160e': 80.0, 'E 161b': 60.0, 'E 170': 1.0, 'E 579': 8.0, 'E 585': 10.0,
  'E 210': 4.0, 'E 212': 5.0, 'E 234': 60.0, 'E 235': 120.0, 'E 261': 3.0, 'E 262': 2.5, 'E 263': 3.0,
  'E 280': 3.0, 'E 281': 3.0, 'E 282': 2.5, 'E 297': 3.0, 'E 302': 12.0, 'E 304': 25.0, 'E 306': 30.0,
  'E 307a': 40.0, 'E 322': 4.0, 'E 325': 2.5, 'E 326': 3.0, 'E 327': 3.0, 'E 335': 5.0, 'E 336': 6.0,
  'E 337': 6.0, 'E 339': 3.0, 'E 340': 3.5, 'E 341': 3.0, 'E 350': 4.0, 'E 351': 4.0, 'E 352': 4.0, 'E 353': 8.0,
  'E 355': 4.0, 'E 363': 6.0, 'E 401': 15.0, 'E 405': 20.0, 'E 406': 25.0, 'E 407': 12.0, 'E 410': 10.0,
  'E 412': 5.0, 'E 417': 12.0, 'E 421': 6.0, 'E 423': 15.0, 'E 425': 15.0, 'E 444': 10.0, 'E 450': 3.0,
  'E 451': 3.0, 'E 452': 3.0, 'E 459': 15.0, 'E 460': 5.0, 'E 461': 15.0, 'E 464': 15.0, 'E 471': 5.0,
  'E 472e': 6.0, 'E 473': 15.0, 'E 501': 1.5, 'E 504': 3.0, 'E 508': 1.5, 'E 511': 1.5, 'E 516': 1.0,
  'E 524': 1.0, 'E 525': 1.5, 'E 526': 0.5, 'E 551': 6.0, 'E 574': 3.0, 'E 575': 3.0, 'E 576': 4.0,
  'E 577': 4.0, 'E 578': 4.0, 'E 640': 4.0, 'E 650': 8.0, 'E 920': 25.0, 'E 948': 0.5,
  'E 952': 6.0, 'E 953': 4.0, 'E 957': 800.0, 'E 959': 250.0, 'E 960b': 80.0, 'E 960c': 80.0, 'E 961': 300.0,
  'E 962': 20.0, 'E 966': 4.0, 'E 999': 20.0, 'E 1200': 4.0, 'E 1404': 1.5, 'E 1410': 1.5, 'E 1412': 1.5,
  'E 1414': 1.5, 'E 1420': 1.5, 'E 1422': 1.5, 'E 1440': 1.5, 'E 1442': 1.5, 'E 1450': 3.0, 'E 1505': 6.0,
  'E 1518': 4.0, 'E 1519': 6.0,
  // Aromasorten (natürliche Aromen ca. 20–60 €/kg, nicht natürliche ca. 10–20 €/kg)
  'Natürliches Pfirsicharoma': 30.0,
  'Natürliches Maracujaaroma': 35.0,
  'Natürliches Pfirsich-Maracuja-Aroma': 35.0,
  'Natürliches Yuzuaroma': 55.0,
  'Natürliches Pink-Grapefruit-Aroma': 30.0,
  'Natürliches Grapefruitaroma': 30.0,
  'Natürliches Blutorangenaroma': 30.0,
  'Natürliches Mandarinenaroma': 30.0,
  'Natürliches Bergamottearoma': 40.0,
  'Natürliches Mangoaroma': 30.0,
  'Natürliches Ananasaroma': 25.0,
  'Natürliches Kokosaroma': 30.0,
  'Natürliches Litschiaroma': 40.0,
  'Natürliches Guavenaroma': 35.0,
  'Natürliches Drachenfruchtaroma': 35.0,
  'Natürliches Kiwiaroma': 30.0,
  'Natürliches Wassermelonenaroma': 30.0,
  'Natürliches Honigmelonenaroma': 30.0,
  'Natürliches Himbeeraroma': 40.0,
  'Natürliches Erdbeeraroma': 30.0,
  'Natürliches Heidelbeeraroma': 40.0,
  'Natürliches Brombeeraroma': 40.0,
  'Natürliches Aroma Schwarze Johannisbeere': 35.0,
  'Natürliches Kirscharoma': 25.0,
  'Natürliches Granatapfelaroma': 35.0,
  'Natürliches Cranberryaroma': 35.0,
  'Natürliches Apfelaroma': 20.0,
  'Natürliches Grüner-Apfel-Aroma': 20.0,
  'Natürliches Birnenaroma': 25.0,
  'Natürliches Traubenaroma': 25.0,
  'Natürliches Aprikosenaroma': 30.0,
  'Natürliches Holunderblütenaroma': 35.0,
  'Natürliches Ingweraroma': 35.0,
  'Natürliches Minzaroma': 30.0,
  'Natürliches Vanillearoma': 60.0,
  'Natürliches Cola-Aroma': 30.0,
  'Natürliches Eistee-Pfirsich-Aroma': 30.0,
  'Natürliches Rhabarberaroma': 35.0,
  'Natürliches Waldmeisteraroma': 35.0,
  'Natürliches Hibiskusaroma': 35.0,
  'Natürliches Tropical-Mix-Aroma': 30.0,
  'Natürliches Beeren-Mix-Aroma': 35.0,
  'Energy-Aroma (Tutti-Frutti)': 25.0,
  'Aroma Pfirsich (nicht natürlich)': 15.0,
  'Aroma Maracuja (nicht natürlich)': 15.0,
  'Aroma Mango (nicht natürlich)': 15.0,
  'Aroma Erdbeere (nicht natürlich)': 15.0,
  'Aroma Kirsche (nicht natürlich)': 15.0,
  'Aroma Zitrone-Limette (nicht natürlich)': 15.0,
  'Aroma Wassermelone (nicht natürlich)': 15.0,
}

// Funktionsklasse → Kategorie der Rohstoff-Datenbank.
const classToCategory = {
  Farbstoff: 'Farbe',
  Süßungsmittel: 'Zucker/Süßungsmittel',
  Säuerungsmittel: 'Säuerungsmittel',
  Säureregulator: 'Säuerungsmittel',
  Konservierungsstoff: 'Konservierungsstoff',
  Antioxidationsmittel: 'Antioxidationsmittel',
  Emulgator: 'Emulgator/Stabilisator',
  Stabilisator: 'Emulgator/Stabilisator',
  Verdickungsmittel: 'Emulgator/Stabilisator',
  Geliermittel: 'Emulgator/Stabilisator',
  Packgas: 'Kohlensäure',
}

export const normalizeENumber = (value) => String(value || '').toUpperCase().replace(/[\s-]/g, '')

const parseLines = (text) => text.split('\n').map((line) => line.split('\t').map((part) => part.trim())).filter((parts) => parts[0])

export const rawMaterialCatalog = [
  ...parseLines(additiveData).map(([eNumber, name, additiveClass]) => ({
    catalogId: `cat-${normalizeENumber(eNumber).toLowerCase()}`,
    name,
    eNumber,
    additiveClass,
    aliases: aliases[eNumber] || [],
    category: eNumber === 'E 290' ? 'Kohlensäure' : classToCategory[additiveClass] || 'Zusatzstoff',
    unit: 'kg',
    referencePrice: referencePrices[eNumber] ?? null,
  })),
  ...parseLines(baseData).map(([name, category, unit], index) => ({
    catalogId: `cat-base-${index + 1}`,
    name,
    eNumber: '',
    additiveClass: '',
    aliases: aliases[name] || [],
    category,
    unit: unit || 'kg',
    referencePrice: referencePrices[name] ?? null,
  })),
]

const catalogById = new Map(rawMaterialCatalog.map((entry) => [entry.catalogId, entry]))
// Alias-Namen auch für Rohstoffe, die früher aus dem Katalog übernommen wurden.
export const catalogAliasesFor = (entry) => [
  ...(Array.isArray(entry?.aliases) ? entry.aliases : []),
  ...(catalogById.get(entry?.catalogId)?.aliases || []),
]

export const catalogAdditiveClasses = [...new Set(rawMaterialCatalog.map((entry) => entry.additiveClass).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'))
