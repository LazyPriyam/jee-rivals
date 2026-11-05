import sqlite3

RECLASSIFY_IDS = [
    "c76b4b6a-11d3-4580-b4dd-a139a5660e22",
    "ecc85c48-5c4c-418f-b7ca-96bb7ed5c4bb",
    "febaca86-93aa-458b-8230-9aca40c69f9e",
    "caa0b0c0-7471-447d-a4f7-f059f9728ce7",
    "b20fd770-b5cb-40f8-b961-2f5292de7d8e",
    "56808b3c-4a3d-4650-aab6-e7c94f9af259",
    "69dfebfb-9922-44ef-81cd-1429c4139aea",
    "a40fb93c-ab47-4e50-89ac-e9be686ec54a",
    "791e9b84-ab7a-4235-9691-01b150282c7b",
    "aa1b1f08-cf8d-4ddb-893e-b558e7c5361f",
    "d3e564f2-568c-4fad-a00c-ef33481ef111",
    "38436a8e-d8ff-42c3-956e-fe372ade1d5a",
    "40c0f664-6221-4083-ae92-bce031e4e98c",
    "ee1f6702-39d3-4c9f-9126-9f6a01c49acd",
    "d12630f2-350c-4171-9792-f94452a32c0d",
    "49618cdb-927d-4f96-ad24-f1cd58e8ff82"
]

db_path = r'C:\Users\Priyashree Sarkar\Desktop\JEE Rivals\backend\storage\rivals.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()

placeholders = ','.join(['?'] * len(RECLASSIFY_IDS))
c.execute(f"UPDATE questions SET chapter = 'Complex Numbers' WHERE id IN ({placeholders})", RECLASSIFY_IDS)
conn.commit()

c.execute("SELECT chapter, count(*) FROM questions WHERE chapter IN ('Complex Numbers', 'Quadratic Equations') GROUP BY chapter")
counts = c.fetchall()
print("Updated local counts:", counts)

conn.close()
