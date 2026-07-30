// GENERATED from ISRI_Nonferrous_Scrap_Categories.xlsx — do not hand-edit item data.
// Source: ReMA's ISRI Specifications, January 2026 edition (isrispecs.org).
// Regenerate by re-parsing the spreadsheet if ISRI publishes an update.
// Pure data — safe to import from both server routes and client components.

export interface MaterialItem {
  code: string; // ISRI code, e.g. "Barley" — this is what gets stored on Deal.material
  name: string; // Item / grade name
  description: string; // Full ISRI grade description (used for tooltips)
}

export interface MaterialCategory {
  category: string; // Main category — also selectable as a Deal.material value
  items: MaterialItem[];
}

export const MATERIAL_CATEGORIES: MaterialCategory[] = [
  {
    category: "Red Metals (Copper/Brass/Bronze)",
    items: [
      { code: "Barley", name: "No. 1 Copper Wire", description: "No. 1 bare, uncoated, unalloyed copper wire, commonly known as Bare Bright copper wire." },
      { code: "Berry", name: "No. 1 Copper Wire", description: "Clean, untinned, uncoated, unalloyed copper wire and cable, free of brittle burnt wire. Free of copper tubing." },
      { code: "Berry/Candy", name: "Candy/Berry Combination", description: "A combination of copper wire and heavy copper as defined in Berry and Candy." },
      { code: "Birch", name: "No. 2 Copper Wire", description: "Miscellaneous, unalloyed copper wire, nominal 96% copper content (min 94%)." },
      { code: "Birch/Cliff", name: "Combination", description: "A combination of No. 2 copper wire and copper as defined in Birch and Cliff." },
      { code: "Candy", name: "No. 1 Heavy Copper Solids and Tubing", description: "Clean, unalloyed, uncoated copper clippings, punchings, bus bars, commutator segments, and clean copper tubing." },
      { code: "Cliff", name: "No. 2 Copper Solids and Tubing", description: "Miscellaneous, unalloyed copper scrap, nominal 96% copper content (min 94%)." },
      { code: "Clove", name: "No. 1 Copper Wire Nodules", description: "No. 1 bare, uncoated, unalloyed copper wire scrap nodules, chopped or shredded. Minimum copper 99%." },
      { code: "Cobra", name: "No. 2 Copper Wire Nodules", description: "No. 2 unalloyed copper wire scrap nodules, chopped or shredded, minimum 97% copper." },
      { code: "Cocoa", name: "Copper Wire Nodules", description: "Unalloyed copper wire scrap nodules, chopped or shredded, minimum 99% copper." },
      { code: "Dream", name: "Light Copper", description: "Miscellaneous, unalloyed copper scrap, nominal 92% copper content (min 88%): sheet copper, gutters, downspouts, kettles, boilers." },
      { code: "Drink", name: "Refinery Brass", description: "Minimum 61.3% copper, maximum 5% iron; brass and bronze solids/turnings, alloyed and contaminated copper scrap." },
      { code: "Droid", name: "Insulated Copper Wire Scrap", description: "No. 2 copper wire (see Birch) with various types of insulation, sold on sample or recovery basis." },
      { code: "Drove", name: "Copper-Bearing Scrap", description: "Miscellaneous copper-containing skimmings, grindings, ashes, irony brass and copper, residues and slags." },
      { code: "Druid", name: "Insulated Copper Wire Scrap", description: "No. 1 bare, uncoated, unalloyed copper wire (see Barley) with various types of insulation." },
      { code: "Ebony", name: "Composition or Red Brass", description: "Red brass scrap, valves, machinery bearings and parts; castings of copper, tin, zinc, and/or lead." },
      { code: "Ebulent", name: "Lead-Free Bismuth Brass Solids", description: "Scrap castings alloyed with copper, tin, bismuth, and zinc; less than 0.2% alloyed lead." },
      { code: "Ecstatic", name: "Lead-Free Bismuth Brass Turnings", description: "Scrap borings/turnings alloyed with copper, tin, bismuth, and zinc; less than 0.2% alloyed lead." },
      { code: "Eland", name: "High Grade-Low Lead Bronze/Brass Solids", description: "Recommended to be sold by analysis." },
      { code: "Elder", name: "Genuine Babbitt-Lined Brass Bushings", description: "Red brass bushings/bearings from autos and machinery, min 12% high tin-base babbitt." },
      { code: "Elias", name: "High Lead Bronze Solids and Borings", description: "Recommended to be sold on sample or analysis." },
      { code: "Enerv", name: "Red Brass Composition Turnings", description: "Turnings from red brass composition material, sold subject to sample or analysis." },
      { code: "Engel", name: "Machinery or Hard Brass Solids", description: "Copper min 75%, tin min 6%, lead 6-11%, total impurities (excl. zinc/antimony/nickel) max 0.75%." },
      { code: "Erin", name: "Machinery or Hard Brass Borings", description: "Copper min 75%, tin min 6%, lead 6-11%, total impurities (excl. zinc/antimony/nickel) max 0.75%." },
      { code: "Fence", name: "Unlined Standard Red Car Boxes (Clean Journals)", description: "Standard unlined/sweated railroad boxes and car journal bearings, free of yellow/iron-backed boxes." },
      { code: "Ferry", name: "Lined Standard Red Car Boxes (Lined Journals)", description: "Standard babbitt-lined railroad boxes and/or journal bearings, free of yellow/iron-backed boxes." },
      { code: "Grape", name: "Cocks and Faucets", description: "Mixed clean red and yellow brass, may be chrome/nickel-plated; min 35% semi-red." },
      { code: "Honey", name: "Yellow Brass Scrap", description: "Mixed yellow brass solids: castings, rolled brass, rod brass, tubing, plated brass." },
      { code: "Ivory", name: "Yellow Brass Castings", description: "Yellow brass castings in crucible shape, max 12in per piece, max 15% nickel plated material." },
      { code: "Label", name: "New Brass Clippings", description: "Cuttings of new unleaded yellow brass sheet/plate, clean, max 10% clean punchings under 1/4in." },
      { code: "Lace", name: "Brass Shell Cases Without Primers", description: "Clean fired 70/30 brass shell cases free of primers; exported shells must be mutilated." },
      { code: "Lady", name: "Brass Shell Cases With Primers", description: "Clean fired 70/30 brass shell cases containing brass primers; exported shells must be mutilated." },
      { code: "Lake", name: "Brass Small Arms and Rifle Shells, Clean Fired", description: "Clean fired 70/30 brass shells free of bullets and iron; exported shells must be mutilated." },
      { code: "Lamb", name: "Brass Small Arms and Rifle Shells, Clean Muffled (Popped)", description: "Clean muffled 70/30 brass shells free of bullets and iron; exported shells must be mutilated." },
      { code: "Lark", name: "Yellow Brass Primer", description: "Clean yellow brass primers, burnt or unburnt, free of iron and excessive dirt/corrosion." },
      { code: "Maize", name: "Mixed New Nickel Silver Clippings", description: "One or more nickel silver alloys, nickel content specified, free of plating material." },
      { code: "Major", name: "New Nickel Silver Clippings and Solids", description: "New, clean nickel silver clippings/plate/rod/forgings, sold on nickel content spec (10-20%)." },
      { code: "Malar", name: "New Segregated Nickel Silver Clippings", description: "One specified nickel silver alloy, max 10% clean punchings under 1/4in." },
      { code: "Malic", name: "Old Nickel Silver", description: "Old nickel silver sheet, pipe, rod, tubes, wire, screen, soldered or unsoldered." },
      { code: "Melon", name: "Brass Pipe", description: "Brass pipe free of plated/soldered materials or cast brass connections; sound, clean." },
      { code: "Naggy", name: "Nickel Silver Castings", description: "To be packed and sold separately." },
      { code: "Nascent", name: "Leaded Brass Scrap Turnings", description: "Scrap borings/turnings alloyed with copper, zinc, lead; less than 0.01% alloyed bismuth/silicon each." },
      { code: "Niche", name: "Leaded Brass Scrap Rod Ends and Forgings", description: "Scrap rod ends/forgings alloyed with copper, zinc, lead; less than 0.01% alloyed bismuth/silicon each." },
      { code: "Niece", name: "Nickel Silver Turnings", description: "To be sold by sample or analysis." },
      { code: "Night", name: "Yellow Brass Rod Turnings", description: "Rod turnings, free of aluminum, manganese, composition, Tobin, and Muntz metal turnings." },
      { code: "Noble", name: "New Yellow Brass Rod Ends", description: "New, clean rod ends from free-turning brass/forging rods; free of Muntz metal and naval brass." },
      { code: "Nomad", name: "Yellow Brass Turnings", description: "Yellow brass turnings, free of aluminum, manganese, and composition turnings." },
      { code: "Ocean", name: "Mixed Unsweated Auto Radiators", description: "Mixed automobile radiators, free of aluminum and iron-finned radiators." },
      { code: "Pales", name: "Brass Condenser Tubes", description: "Clean condenser tubing, plated or unplated, free of excessive corroded material." },
      { code: "Pallu", name: "Aluminum Brass Condenser Tubes", description: "Clean sound condenser tubing, plated or unplated, free of nickel alloy and corrosion." },
      { code: "Palms", name: "Muntz Metal Tubes", description: "Clean sound Muntz metal tubing, plated or unplated, free of nickel alloy, aluminum alloy, corrosion." },
      { code: "Parch", name: "Manganese Bronze Solids", description: "Copper content min 55%, lead max 1%, free of aluminum bronze and silicon bronze." },
    ],
  },
  {
    category: "Aluminum",
    items: [
      { code: "Tablet", name: "Clean Aluminum Lithographic Sheets", description: "1000/3000 series alloys, free of paper/plastic/excessively inked sheets. Min size 3in." },
      { code: "Tabloid", name: "New, Clean Aluminum Lithographic Sheets", description: "1000/3000 series alloys, uncoated/unpainted, free of paper/plastic/ink. Min size 3in." },
      { code: "Taboo", name: "Mixed Low Copper Aluminum Clippings and Solid", description: "New, clean, uncoated/unpainted low-copper aluminum, two+ alloys, min 0.015in thick, free of 2000/7000 series." },
      { code: "Taint/Tabor", name: "Clean Mixed Old Alloy Sheet Aluminum", description: "Clean old alloy aluminum sheet, two+ alloys, free of foil, blinds, castings, hair wire, food/beverage containers." },
      { code: "Take", name: "New Aluminum Can Stock", description: "New low-copper aluminum can stock/clippings, clean, lithographed or not, coated with clear lacquer." },
      { code: "Talc", name: "Post-Consumer Aluminum Can Scrap", description: "Old aluminum food/beverage cans, free of other scrap metals, foil, tin cans, plastic, glass." },
      { code: "Talcred", name: "Shredded Aluminum Used Beverage Can (UBC) Scrap", description: "Density 12-17 lb/cu ft, max 5% fines, magnetically separated, free of steel/lead/plastic." },
      { code: "Taldack", name: "Densified Aluminum Used Beverage Can (UBC) Scrap", description: "Biscuit density 35-50 lb/cu ft, each biscuit max 60 lb; magnetically separated, free of steel/lead." },
      { code: "Taldon", name: "Baled Aluminum Used Beverage Can (UBC) Scrap", description: "Min density 14 lb/cu ft, max 17 (unflattened)/22 (flattened) lb/cu ft; magnetically separated." },
      { code: "Taldork", name: "Briquetted Aluminum Used Beverage Can (UBC) Scrap", description: "Briquette density min 50 lb/cu ft; magnetically separated, free of steel/plastic/glass/dirt." },
      { code: "Tale", name: "Painted Siding", description: "Clean, low-copper aluminum siding scrap, painted one/two sides, free of plastic coating, iron, dirt." },
      { code: "Talk", name: "Aluminum Copper Radiators", description: "Clean aluminum and copper radiators, and/or aluminum fins on copper tubing, free of brass tubing/iron." },
      { code: "Tall", name: "E.C. Aluminum Chops and Straws", description: "Clean 1350/1050 alloy E.C. aluminum chops/straws, free of screening/hairwire/iron. Min 99.45% aluminum." },
      { code: "Tally", name: "All Aluminum Radiators From Automobiles", description: "Clean aluminum radiators and/or condensers, free of other radiator types. Contaminants max 1%." },
      { code: "Talon", name: "E.C. Aluminum Wire and Cable", description: "New, clean 1350/1050 E.C. aluminum wire/cable, free of hair wire, ACSR, screen. Min 99.45% aluminum." },
      { code: "Tank", name: "Aluminum Chops and Straws", description: "Clean aluminum chops/straws, free of screening/hair-wire/iron/copper/insulation. Min 99% aluminum." },
      { code: "Tann", name: "New Mixed Aluminum Wire and Cable", description: "New, clean, unalloyed aluminum wire/cable, may contain up to 10% 6000 series." },
      { code: "Tarry A", name: "Clean Aluminum Pistons", description: "Clean aluminum pistons, free of struts/bushings/shafts/iron rings. Oil/grease max 2%." },
      { code: "Tarry B", name: "Clean Aluminum Pistons With Struts", description: "Clean whole aluminum pistons with struts, free of bushings/shafts/iron. Oil/grease max 2%." },
      { code: "Tarry C", name: "Irony Aluminum Pistons", description: "Aluminum pistons with non-aluminum attachments; sold on recovery basis or special arrangement." },
      { code: "Tassel", name: "Old Mixed Aluminum Wire and Cable", description: "Old, unalloyed aluminum wire/cable, may contain up to 10% 6000 series, max 1% free oxide/dirt." },
      { code: "Taste", name: "Old Pure Aluminum Wire and Cable", description: "Old, unalloyed aluminum wire/cable, max 1% free oxide/dirt, free of hair wire/screen/iron." },
      { code: "Tata", name: "New Production Aluminum Extrusions", description: "One alloy (typically 6063); may contain butt ends; anodized acceptable." },
      { code: "Tease", name: "Aluminum Wire and Cable", description: "New, clean aluminum wire/cable, free of hair wire, ACSR, wire screen, iron, insulation. Min 99% aluminum." },
      { code: "Teens", name: "Segregated Aluminum Borings and Turnings", description: "One specified alloy; free of oxidation, dirt, free iron, stainless, magnesium, oil. Fines max 3%." },
      { code: "Telic", name: "Mixed Aluminum Borings and Turnings", description: "Clean, uncorroded, two or more alloys; deductions for fines >3% through 20 mesh screen." },
      { code: "Tense", name: "Mixed Aluminum Castings", description: "All clean aluminum castings, may include auto/airplane castings, no ingots; oil/grease max 2%." },
      { code: "Tepid", name: "Aircraft Sheet Aluminum", description: "Sold on recovery basis or by special arrangement with purchaser." },
      { code: "Terse", name: "New Aluminum Foil", description: "Clean, new, pure, uncoated 1000/3000/8000 series alloy foil, free of anodized/radar foil, paper, plastics." },
      { code: "Tesla", name: "Post Consumer Aluminum Foil", description: "Baled old household aluminum foil/formed containers, uncoated 1000/3000/8000 series; max 5% organic residue." },
      { code: "Tetra", name: "New Coated Aluminum Foil", description: "New aluminum foil coated/laminated with ink, lacquers, paper, or plastic; sold on metal content basis." },
      { code: "Thigh", name: "Aluminum Grindings", description: "Sold on recovery basis or by special arrangement with purchaser." },
      { code: "Thirl", name: "Aluminum Drosses, Spatters, Spillings, Skimmings and Sweepings", description: "Sold on recovery basis or by special arrangement with purchaser." },
      { code: "Thorn", name: "Aluminum Breakage", description: "Aluminum with miscellaneous contaminants (iron, dirt, plastic); min 33% aluminum unless agreed otherwise." },
      { code: "Throb", name: "Sweated Aluminum", description: "Aluminum scrap sweated/melted into ingot, sow, or slab form; free from corrosion/dross/non-aluminum inclusions." },
      { code: "Tooth", name: "Segregated New Aluminum Alloy Clippings and Solids", description: "New, clean, uncoated/unpainted, one specified alloy, min 0.015in thick; free of hair wire/screen." },
      { code: "Toto", name: "Aluminum Extrusions \"10/10\"", description: "New production and old/used 6063 extrusions, may contain up to 10% painted and 10% 6061 alloy." },
      { code: "Tough", name: "Mixed New Aluminum Alloy Clippings and Solids", description: "New, clean, uncoated/unpainted, two or more alloys, min 0.015in thick; free of hair wire/screen." },
      { code: "Tread", name: "Segregated New Aluminum Castings, Forgings and Extrusions", description: "New, clean, uncoated, one specified alloy only; free of sawings, stainless steel, zinc, iron." },
      { code: "Trill", name: "ACSR", description: "Aluminum Conductor Steel Reinforced wire, combination of steel and aluminum wire; recovery agreed upon." },
      { code: "Troma", name: "Aluminum Auto or Truck Wheels", description: "Clean, single-piece, unplated wheels of a single specified alloy; free of inserts, steel, weights, tires." },
      { code: "Trump", name: "Aluminum Auto Castings", description: "All clean automobile aluminum castings, readily identified size; free of iron/dirt/brass/bushings." },
      { code: "Tutu", name: "Aluminum Extrusion Dealer Grade", description: "Old extruded aluminum of one alloy (typically 6063, 6061, or 7075); free of iron/thermo break/saw chips." },
      { code: "Twang", name: "IAW (Insulated Aluminum Wire)", description: "May or may not contain other wires/metal shielding; expected aluminum recovery agreed upon." },
      { code: "Tweak", name: "Fragmentizer Aluminum Scrap (from Automobile Shredders)", description: "Mechanical/hand separated; max 4% free zinc, 1% free magnesium, 1.5% analytical iron." },
      { code: "Twire", name: "Burnt Fragmentizer Aluminum Scrap (from Automobile Shredders)", description: "Incinerated/burned material; max 4% free zinc, 1% free magnesium, 1.5% analytical iron, plus ash %." },
      { code: "Twirl 2.0", name: "Fragmentizer Aircraft Aluminum Scrap (2000 and 7000 Series)", description: "Dry, max 2% free zinc, 1% free magnesium, 1.5% free iron/stainless, max 2% analytical iron." },
      { code: "Twist", name: "Aluminum Airplane Castings", description: "Clean aluminum castings from airplanes, free from iron/dirt/brass/bushings; oil/grease max 2%." },
      { code: "Twitch", name: "Floated Fragmentizer Aluminum Scrap (from Automobile Shredders)", description: "Wet/dry media separated; max 1% free zinc, 1% free magnesium, 1% analytical iron." },
      { code: "Vesper", name: "Vesper", description: "Aluminum sheet/extrusion/plate grades (wrought) segregated from zorba or twitch; max 1% free Mg, 1% free Zn, 0.5% analytical Fe." },
      { code: "Zorba", name: "Shredded Nonferrous Scrap (Predominantly Aluminum)", description: "Combination of nonferrous metals (aluminum, copper, lead, magnesium, stainless, nickel, tin, zinc); ID'd with % nonferrous content (e.g. 'Zorba 90'). Also listed under Mixed Metals." },
    ],
  },
  {
    category: "Zinc",
    items: [
      { code: "Saves", name: "Old Zinc Die Cast Scrap", description: "Miscellaneous old zinc base die castings, with/without iron and foreign attachments; max 30% iron." },
      { code: "Scabs", name: "New Zinc Die Cast Scrap", description: "New/unused, clean, zinc base die castings; unplated, unpainted, free from corrosion." },
      { code: "Scoot", name: "Zinc Die Cast Automotive Grilles", description: "Clean, old/used zinc base die cast automotive grilles, free from soldered material." },
      { code: "Scope", name: "New Plated Zinc Die Cast Scrap", description: "New/unused, clean, plated zinc base die castings, free from corrosion." },
      { code: "Score", name: "Old Scrap Zinc", description: "Clean dry scrap zinc: sheets, jar lids, clean unalloyed castings, anti-corrosion plates. No borings/turnings." },
      { code: "Screen", name: "New Zinc Clippings", description: "New pure zinc sheets/stampings, free from corrosion, no foreign material. Printer's zinc by special arrangement." },
      { code: "Scribe", name: "Crushed Clean Sorted Fragmentizers Die Cast Scrap", description: "As produced from automobile fragmentizers; clean, free of dirt/oil/glass/rubber/trash. Max 5% unmeltables." },
      { code: "Scroll", name: "Unsorted Zinc Die Cast Scrap", description: "Produced from auto fragmentizers; ~55% zinc-bearing scrap, ~40% other nonferrous, ~1% insulated copper wire." },
      { code: "Scrub", name: "Hot Dip Galvanizers Slab Zinc Dross (Batch Process)", description: "Unsweated zinc dross in slab form from hot dip galvanizing; min 92% zinc, free of skimmings/tramp iron." },
      { code: "Scull", name: "Zinc Die Cast Slabs or Pigs", description: "Melted zinc base die cast material in smooth clean solid slabs/pigs; min 90% zinc, max 0.1% nickel, 1% lead." },
      { code: "Seal", name: "Continuous Line Galvanizing Slab Zinc Top Dross", description: "Unsweated zinc dross from top of continuous line galvanizing bath, slab form; min 90% zinc." },
      { code: "Seam", name: "Continuous Line Galvanizing Slab Zinc Bottom Dross", description: "Unsweated zinc dross from bottom of continuous line galvanizing bath, slab form; min 92% zinc." },
      { code: "Shelf", name: "Prime Zinc Die Cast Dross", description: "Metal skimmed from top of pot of molten zinc die cast metal; unsweated, unfluxed, shiny, smooth, metallic." },
    ],
  },
  {
    category: "Magnesium",
    items: [
      { code: "Wafer", name: "Magnesium Clips", description: "Clean magnesium clips in crucible size, free of copper/aluminum/zinc flashings and excessive oil/grease." },
      { code: "Walnut", name: "Magnesium Scrap", description: "Magnesium castings, engine blocks, transmission casings, bomber/car wheels, extrusions, sheet." },
      { code: "Wine", name: "Magnesium Engraver Plates", description: "Free of copper, aluminum, zinc, and electrotype plates; clean and free of all foreign attachments." },
      { code: "Wood", name: "Magnesium Dockboards", description: "Clean magnesium dockboard cut or broken to agreed size, free of all foreign attachments." },
      { code: "World", name: "Magnesium Turnings", description: "Recommended to be sold by special arrangement between buyer and seller." },
    ],
  },
  {
    category: "Lead",
    items: [
      { code: "Racks", name: "Scrap Lead\u2014Soft", description: "Clean soft scrap lead, free of drosses, battery plates, lead covered cable, hard lead, type metals, radioactive materials." },
      { code: "Radio", name: "Mixed Hard/Soft Scrap Lead", description: "Clean lead solids and lead shots, free of drosses, battery plates, lead covered cable, type metals." },
      { code: "Rains", name: "Scrap Drained/Dry Whole Intact Lead", description: "Free of any liquid; plastic or rubber cases, complete including caps. Non-lead batteries not acceptable." },
      { code: "Rakes", name: "Battery Lugs", description: "Free of scrap lead, wheel weights, battery plates, rubber/plastic case material. Min 97% metallic content." },
      { code: "Reels", name: "Mixed Nonferrous Wheel Weights", description: "Min 35% (overall) nonferrous, max 65% iron; nonferrous material may be lead and zinc weights." },
      { code: "Relay", name: "Lead Covered Copper Cable", description: "Free of armored covered cable and foreign material, subject to negotiation." },
      { code: "Rents", name: "Lead Dross", description: "Clean, reasonably free of other materials (iron, dirt, chemicals); free of radioactive materials, aluminum, zinc." },
      { code: "Rink", name: "Scrap Wet Whole Intact Lead Batteries", description: "SLI (starting/lighting/ignition), automotive, truck, 8-D, golf cart, marine-type batteries." },
      { code: "Rono", name: "Scrap Industrial Intact Lead Cells", description: "Plates enclosed by complete plastic case; partial/cracked/broken cells subject to special agreement." },
      { code: "Roper", name: "Scrap Whole Intact Industrial Lead Batteries", description: "Bus, diesel, locomotive, telephone, and/or steel cased batteries; submarine batteries subject to negotiation." },
      { code: "Ropes", name: "Lead Wheel Weights", description: "Lead wheel weights with or without iron clips; not to include scrap lead, lugs, or plates unless agreed." },
    ],
  },
  {
    category: "Nickel/Stainless/Hi Temp",
    items: [
      { code: "Aroma", name: "New Nickel Scrap", description: "Clean new sheet, plate, bar, tube, wrought nickel solids. Nickel min 99%; Cobalt max 0.25%; Copper max 0.50%." },
      { code: "Burly", name: "Old Nickel Scrap", description: "Old/new sheet, plate, bar, tube, wrought nickel solids. Min 98% nickel; Copper max 0.50%." },
      { code: "Dandy", name: "New Cupro Nickel Clips and Solids", description: "Clean, new, segregated 70/30, 80/20, or 90/10 cupro nickel tube/pipe/sheet/plate/wrought forms." },
      { code: "Daunt", name: "Cupro Nickel Solids", description: "Old/new, segregated 70/30, 80/20, 90/10 cupro nickel tube/pipe/sheet/plate; max 2% sediment." },
      { code: "Decoy", name: "Cupro Nickel Spinnings, Turnings, Borings", description: "Clean, segregated 70/30, 80/20, 90/10 cupro nickel spinnings/turnings/borings." },
      { code: "Delta", name: "Soldered Cupro Nickel Solids", description: "Segregated 70/30, 80/20, 90/10 cupro nickel solids, soldered/brazed/sweated material." },
      { code: "Depth", name: "Miscellaneous Nickel-Copper and Nickel-Copper Iron", description: "Basic elements by weight are nickel and copper (peelings, plating racks, hangers); sold by description/analysis." },
      { code: "Hitch", name: "New R-Monel Clippings and Solids", description: "Clean, new, R-Monel sheet/plate/bar/rod/tube/pipe or other wrought scrap." },
      { code: "House", name: "New Mixed Monel Solids and Clippings", description: "New, clean R and K-Monel solids and clippings, free of cast material and foreign attachments." },
      { code: "Ideal", name: "Old Monel Sheet and Solids", description: "Clean R and K-Monel solids: sheet, plate, pipe, rods, forgings, screen, wire cloth; free of soldered/brazed material." },
      { code: "Indian", name: "K-Monel Solids", description: "Clean K-Monel solids." },
      { code: "Junto", name: "Soldered Monel Sheet and Solids", description: "Soldered/brazed miscellaneous Monel alloys, wrought or cast form; free of trimmed seams/edges." },
      { code: "Lemon", name: "Monel Castings", description: "Various types of clean Monel castings, assaying minimum 60% nickel." },
      { code: "Lemur", name: "Monel Turnings", description: "Mixed Monel turnings and borings, minimum 60% nickel content, dry basis." },
      { code: "Pekoe", name: "200 Series Stainless Steel Scrap Solids", description: "Clean AISI Series Stainless scrap solids, max 0.5% copper, free of foreign attachments." },
      { code: "Sabot", name: "Stainless Steel Scrap", description: "Clean 18-8 type stainless steel clips/solids, min 7% nickel, 16% chrome, max 0.50% molybdenum/copper." },
      { code: "Saint", name: "Nickel Bearing Scrap", description: "Any nickel bearing alloy scrap containing minimum 3% recovered nickel; content determined by recovery." },
      { code: "Ultra", name: "Stainless Steel Turnings", description: "Clean 18-8 type stainless steel turnings, min 7% nickel and 16% chrome, free of nonferrous/nonmetallics." },
      { code: "Vaunt", name: "Edison Batteries", description: "Nickel-iron batteries, sold free of crates, copper terminal connectors, excess liquid; free of ni-cad batteries." },
      { code: "Zurik", name: "Shredded Nonferrous Sensor Sorted Scrap (Predominantly Stainless Steel)", description: "Combination of nonferrous metals via sensor sorting; ID'd with % nonferrous content (e.g. 'Zurik 90'). Also listed under Mixed Metals." },
    ],
  },
  {
    category: "Mixed Metals",
    items: [
      { code: "Darth", name: "Ballasts (Fluorescent)", description: "Whole and complete fluorescent light ballasts containing copper inside; must not contain PCBs." },
      { code: "Vader", name: "Sealed Units", description: "Whole steel-cased compressors from condensers/AC units/freezers/refrigerators, containing a motor inside; free of CFCs/PCBs." },
      { code: "Elmo", name: "Mixed Electric Motors", description: "Whole/dismantled electric motors, primarily copper-wound; may contain some aluminum-wound material." },
      { code: "Sheema", name: "Shredded Electric Motors (\"Shredder Pickings\"/\"Meatballs\")", description: "Mixed copper and aluminum bearing material from ferrous shredding, motors without cases." },
      { code: "Shelmo", name: "Shredded Electric Motors (\"Shredder Pickings\"/\"Meatballs\")", description: "Mixed copper-bearing material from ferrous shredding; may contain up to 5% aluminum-wound material." },
      { code: "Small Elmo", name: "Electric Motors", description: "Basketball-size or smaller; whole/dismantled electric motors, primarily copper-wound." },
      { code: "Zebra", name: "(High Density)", description: "High-density nonferrous metals via media separation: brass, copper, zinc, nonmagnetic stainless, copper wire." },
      { code: "Zeppelin", name: "(Light Density)", description: "Light-density nonferrous metals via media separation: thin-gauge aluminum and magnesium." },
      { code: "Zeyda", name: "Shredded Insulated Copper Wire", description: "Predominantly recovered ICW via mechanical/physical separation; ID'd e.g. 'Zeyda 45/3' (45% copper, 3% other)." },
      { code: "Zorba", name: "Shredded Nonferrous Scrap (Predominantly Aluminum)", description: "Combination of nonferrous metals; ID'd with % nonferrous content (e.g. 'Zorba 90'). Also listed under Aluminum." },
      { code: "Zurik", name: "Shredded Nonferrous Sensor Sorted Scrap (Predominantly Stainless Steel)", description: "Combination of nonferrous metals via sensor sorting; ID'd with % nonferrous content. Also listed under Nickel/Stainless/Hi Temp." },
    ],
  },
  {
    category: "Other",
    items: [
      { code: "Ranch", name: "Block Tin", description: "Minimum assay 98% tin, free of liquids, solder, brass connections, pewter, pumps, pot pieces, dirt." },
      { code: "Ranks", name: "Pewter", description: "Tableware and soda-fountain boxes, minimum 84% tin. Siphon tops accounted for separately." },
      { code: "Raves", name: "High Tin Base Babbitt", description: "Minimum 78% tin, free of brassy or zincy metals." },
      { code: "Roses", name: "Mixed Common Babbitt", description: "Lead base bearing metal, not less than 8% tin, free from Allens metal, ornamental, antimonial, type metal." },
    ],
  },
];

// Every valid Deal.material value: the 8 main category names plus every
// unique ISRI code. Used for server-side validation of NEW material values.
export const MATERIAL_VALUES: string[] = [
  ...MATERIAL_CATEGORIES.map((c) => c.category),
  ...Array.from(new Set(MATERIAL_CATEGORIES.flatMap((c) => c.items.map((i) => i.code)))),
];

// Lookup: code -> item (first occurrence wins for codes listed twice).
const byCode = new Map<string, MaterialItem>();
for (const cat of MATERIAL_CATEGORIES) {
  for (const item of cat.items) {
    if (!byCode.has(item.code)) byCode.set(item.code, item);
  }
}

// Human-friendly label for a stored material value.
// "Barley" -> "Barley — No. 1 Copper Wire"; category names pass through.
export function materialLabel(value: string): string {
  const item = byCode.get(value);
  return item ? `${item.code} — ${item.name}` : value;
}
