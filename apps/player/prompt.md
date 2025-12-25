I want to introduce a new way of making edits to the book, outside directly of the bookgenius-cms. when command key is pressed and a person hovers over a paragraph it should show possible-edit indication, maybe just get slightly bigger (without reflowing the text below!). when a person clicks on a paragraph it should open a modal that should allow:
setting the <Character talking="true"/> at the beginning of the line.

that means the backend will have to find the place by chapter id and element with data-index id, do the change in place, save and publish, which would get synced back to the frontend.
To make this perfect, we should also make mutation use optimistic UI to modify the value of the .html files we fetch for chapters.
