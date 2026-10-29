1. Dates are TEXT in the form 'YYYY-MM-DD HH:MM:SS' (InvoiceDate, BirthDate, HireDate).
   Compare them as strings with half-open ranges: InvoiceDate >= '2023-01-01' AND
   InvoiceDate < '2024-01-01'. Never write InvoiceDate <= '2023-12-31' — a timestamp on the
   31st sorts after that string and is silently dropped. strftime('%Y', col) also works.
2. Money is in US dollars. Invoice.Total is the invoice amount (it equals the sum of its
   InvoiceLine UnitPrice * Quantity). "Sales" or "revenue" means SUM(Invoice.Total).
3. A track's length is Track.Milliseconds. There is no duration in seconds or minutes.
4. Customer.SupportRepId is the EmployeeId of the customer's support rep.
   Employee.ReportsTo is the EmployeeId of that employee's manager (NULL for the top).
5. Playlists and tracks are many-to-many through PlaylistTrack.
