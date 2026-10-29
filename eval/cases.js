// Labelled cases for the eval harness. Each case: { id, question, expect, notes }.
//   expect { type: 'rows', sql } — gold SQL, hand-written and run against data/chinook.sqlite first.
//                                  Grading runs both queries and compares the rows.
//   expect { type: 'refused' }   — the question needs something the schema does not have, so the
//                                  only right outcome is stage 'refused'.
//
// Rules the gold queries follow:
// - Dates are TEXT 'YYYY-MM-DD HH:MM:SS'. Ranges are half-open string compares.
// - Money is summed from Invoice.Total and rounded to 2 places, and the question says so —
//   a raw float sum (523.0600000000003) is the same answer but not the same value.
// - Each question has exactly one right answer: no ties at a LIMIT boundary, and the output
//   columns are named in the question so the column count cannot drift.

export const cases = [
  {
    id: 1,
    question: 'How many tracks are there in total?',
    expect: { type: 'rows', sql: `SELECT COUNT(*) FROM Track` },
    notes: 'Expected 3503. Sanity case. If this fails, something structural is broken, not the model.',
  },
  {
    id: 2,
    question: 'How many customers are from Brazil?',
    expect: { type: 'rows', sql: `SELECT COUNT(*) FROM Customer WHERE Country = 'Brazil'` },
    notes: 'Expected 5. One filter on a text value.',
  },
  {
    id: 3,
    question: 'Top 3 artists by number of albums, with the artist name and album count.',
    expect: {
      type: 'rows',
      sql: `
        SELECT ar.Name, COUNT(*) AS albums
        FROM Artist ar
        JOIN Album al ON al.ArtistId = ar.ArtistId
        GROUP BY ar.ArtistId, ar.Name
        ORDER BY albums DESC
        LIMIT 3
      `,
    },
    notes:
      'Expected Iron Maiden 21, Led Zeppelin 14, Deep Purple 11. No tie at the boundary: ' +
      'fourth place is 10, so the plain "top 3" has one answer.',
  },
  {
    id: 4,
    question:
      'Top 5 billing countries by total sales, with the country and the total rounded to 2 decimal places.',
    expect: {
      type: 'rows',
      sql: `
        SELECT BillingCountry, ROUND(SUM(Total), 2) AS sales
        FROM Invoice
        GROUP BY BillingCountry
        ORDER BY sales DESC
        LIMIT 5
      `,
    },
    notes:
      'Expected USA 523.06 first, Germany 156.48 fifth. Customer.Country and ' +
      'Invoice.BillingCountry agree on every invoice, so either join path is right.',
  },
  {
    id: 5,
    question: 'Which genre has the most tracks? Give the genre name and the track count.',
    expect: {
      type: 'rows',
      sql: `
        SELECT g.Name, COUNT(*) AS tracks
        FROM Genre g
        JOIN Track t ON t.GenreId = g.GenreId
        GROUP BY g.GenreId, g.Name
        ORDER BY tracks DESC
        LIMIT 1
      `,
    },
    notes: 'Expected Rock 1297.',
  },
  {
    id: 6,
    question: 'What were the total sales in 2023, rounded to 2 decimal places?',
    expect: {
      type: 'rows',
      sql: `
        SELECT ROUND(SUM(Total), 2)
        FROM Invoice
        WHERE InvoiceDate >= '2023-01-01' AND InvoiceDate < '2024-01-01'
      `,
    },
    notes:
      "Expected 469.58. A calendar year on a TEXT date. strftime('%Y', InvoiceDate) = '2023' " +
      'is equally right.',
  },
  {
    id: 7,
    question: 'How many invoices were issued in March 2022?',
    expect: {
      type: 'rows',
      sql: `
        SELECT COUNT(*) FROM Invoice
        WHERE InvoiceDate >= '2022-03-01' AND InvoiceDate < '2022-04-01'
      `,
    },
    notes:
      "Expected 7. InvoiceDate <= '2022-03-31' is a latent bug ('2022-03-31 00:00:00' sorts " +
      'after it), but no March invoice falls on the 31st, so it still scores right here.',
  },
  {
    id: 8,
    question:
      'Which support rep looks after the most customers? Give their first name, last name and the number of customers.',
    expect: {
      type: 'rows',
      sql: `
        SELECT e.FirstName, e.LastName, COUNT(*) AS customers
        FROM Employee e
        JOIN Customer c ON c.SupportRepId = e.EmployeeId
        GROUP BY e.EmployeeId, e.FirstName, e.LastName
        ORDER BY customers DESC
        LIMIT 1
      `,
    },
    notes: 'Expected Jane Peacock 21. "Support rep" has to be mapped to Customer.SupportRepId.',
  },
  {
    id: 9,
    question: 'What is the name of the longest track?',
    expect: {
      type: 'rows',
      sql: `SELECT Name FROM Track ORDER BY Milliseconds DESC LIMIT 1`,
    },
    notes: 'Expected "Occupation / Precipice". Length is Milliseconds; there is no duration column.',
  },
  {
    id: 10,
    question: 'How many tracks have no composer?',
    expect: { type: 'rows', sql: `SELECT COUNT(*) FROM Track WHERE Composer IS NULL` },
    notes: "Expected 977. Missing is NULL, not ''.",
  },
  {
    id: 11,
    question: 'Which customer has spent the most in total? Give only the customer id.',
    expect: {
      type: 'rows',
      sql: `
        SELECT CustomerId
        FROM Invoice
        GROUP BY CustomerId
        ORDER BY SUM(Total) DESC
        LIMIT 1
      `,
    },
    notes: 'Expected 6 (49.62), two dollars clear of second place.',
  },
  {
    id: 12,
    question: "How many playlists contain the track 'Balls to the Wall'?",
    expect: {
      type: 'rows',
      sql: `
        SELECT COUNT(DISTINCT pt.PlaylistId)
        FROM PlaylistTrack pt
        JOIN Track t ON t.TrackId = pt.TrackId
        WHERE t.Name = 'Balls to the Wall'
      `,
    },
    notes: 'Expected 3. A many-to-many through the PlaylistTrack junction table.',
  },
  {
    id: 13,
    question: 'How many units of Jazz tracks have been sold?',
    expect: {
      type: 'rows',
      sql: `
        SELECT SUM(il.Quantity)
        FROM InvoiceLine il
        JOIN Track t ON t.TrackId = il.TrackId
        JOIN Genre g ON g.GenreId = t.GenreId
        WHERE g.Name = 'Jazz'
      `,
    },
    notes:
      "Expected 80. Three tables. Not Rock: LIKE '%Rock%' also matches 'Rock And Roll', so that " +
      'question had two right answers. Every Quantity is 1, so COUNT(*) is equally right.',
  },
  {
    id: 14,
    question: 'How many albums does AC/DC have?',
    expect: {
      type: 'rows',
      sql: `
        SELECT COUNT(*)
        FROM Album al
        JOIN Artist ar ON ar.ArtistId = al.ArtistId
        WHERE ar.Name = 'AC/DC'
      `,
    },
    notes: 'Expected 2. A name with a slash in it, which a model may try to escape or split.',
  },
  {
    id: 15,
    question: 'How many tracks are video files?',
    expect: {
      type: 'rows',
      sql: `
        SELECT COUNT(*)
        FROM Track t
        JOIN MediaType m ON m.MediaTypeId = t.MediaTypeId
        WHERE m.Name LIKE '%video%'
      `,
    },
    notes:
      "Expected 214. The only video type is 'Protected MPEG-4 video file', so the model has to " +
      'fuzzy-match a value it never saw.',
  },
  {
    id: 16,
    question: 'How many employees were hired before 2003?',
    expect: {
      type: 'rows',
      sql: `SELECT COUNT(*) FROM Employee WHERE HireDate < '2003-01-01'`,
    },
    notes: 'Expected 3. A one-sided date bound on TEXT.',
  },
  {
    id: 17,
    question: 'How many artists have no albums?',
    expect: {
      type: 'rows',
      sql: `SELECT COUNT(*) FROM Artist WHERE ArtistId NOT IN (SELECT ArtistId FROM Album)`,
    },
    notes: 'Expected 71. An anti-join; a LEFT JOIN ... IS NULL is equally right.',
  },
  {
    id: 18,
    question: 'How many employees report directly to Nancy Edwards?',
    expect: {
      type: 'rows',
      sql: `
        SELECT COUNT(*)
        FROM Employee e
        JOIN Employee m ON m.EmployeeId = e.ReportsTo
        WHERE m.FirstName = 'Nancy' AND m.LastName = 'Edwards'
      `,
    },
    notes: 'Expected 3. A self-join through Employee.ReportsTo.',
  },
  {
    id: 19,
    question: "What is each customer's date of birth?",
    expect: { type: 'refused' },
    notes:
      'Customer has no birth date. The trap is Employee.BirthDate: a real date-of-birth column, ' +
      'on the wrong table.',
  },
  {
    id: 20,
    question: 'Which tracks have been streamed the most?',
    expect: { type: 'refused' },
    notes:
      'No play or stream count exists. The tempting wrong answer is units sold from InvoiceLine, ' +
      'which answers a different question.',
  },
  {
    id: 21,
    question: 'What is the average rating of each album?',
    expect: { type: 'refused' },
    notes: 'No rating, review or score column anywhere.',
  },
  {
    id: 22,
    question: 'In what year was each album released?',
    expect: { type: 'refused' },
    notes:
      'Album has AlbumId, Title, ArtistId — no release date. The trap is InvoiceDate, a date ' +
      'nearby that measures when it was sold, not when it came out.',
  },
];
