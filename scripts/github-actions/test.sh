cat public_books/Lalka/assets/adwokat.png | head -n 1

while IFS= read -r file; do
        git checkout -f -- "$file"
        oid=$(grep "oid sha256" "$file" | awk '{print $2}')
        echo "SHA: $oid"
        if [[ -n "$oid" ]]; then
#          git lfs fetch --object-id "$oid"
#          git lfs checkout --include="$file"
          echo "oid is here ${oid}"
        else
          echo "File  $file is not a LFS pointer"
        fi
      done < changed.txt