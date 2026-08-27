import json
import requests
from typing import List, Dict
import time

BASE_URL = "https://timetable.spbu.ru/api/v1"

def get_study_divisions() -> List[Dict]:
    response = requests.get(f"{BASE_URL}/study/divisions", timeout=30)
    response.raise_for_status()
    return response.json()

def get_division_program_levels(alias: str) -> List[Dict]:
    response = requests.get(f"{BASE_URL}/study/divisions/{alias}/programs/levels", timeout=30)
    response.raise_for_status()
    return response.json()

def get_program_groups(program_id: int) -> List[Dict]:
    response = requests.get(f"{BASE_URL}/programs/{program_id}/groups", timeout=30)
    response.raise_for_status()
    data = response.json()
    return data.get("Groups", [])

def export_all_groups() -> List[Dict]:
    all_groups = []
    divisions = get_study_divisions()
    
    print(f"Найдено подразделений: {len(divisions)}")
    
    for i, div in enumerate(divisions, 1):
        if i < 31 :
            continue
        print(f"[{i}/{len(divisions)}] Обрабатываю: {div['Name']}")
        try:
            levels = get_division_program_levels(div['Alias'])
        except Exception as e:
            print(f"  Ошибка загрузки программ: {e}")
            continue
        
        for level in levels:
            if not level.get('StudyProgramCombinations'):
                continue
            
            for combo in level['StudyProgramCombinations']:
                if not combo.get('AdmissionYears'):
                    continue
                
                for year in combo['AdmissionYears']:
                    program_id = year['StudyProgramId']
                    try:
                        groups = get_program_groups(program_id)
                        for group in groups:
                            all_groups.append({
                                'id': group['StudentGroupId'],
                                'name': group['StudentGroupName'],
                                'division': div['Name'],
                                'program': combo['Name'],
                                'level': level.get('StudyLevelName', ''),
                                'year': year['YearNumber']
                            })
                        if groups:
                            print(f"    + {len(groups)} групп")
                    except Exception as e:
                        print(f"  Ошибка загрузки групп программы {program_id}: {e}")
                        continue
        
        time.sleep(1)
    
    return all_groups

if __name__ == "__main__":
    print("Начинаю выгрузку групп...")
    print("Это может занять несколько минут...\n")
    
    start_time = time.time()
    groups = export_all_groups()
    elapsed = time.time() - start_time
    
    output_file = "groups.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(groups, f, ensure_ascii=False, indent=2)
    
    print(f"\n{'='*50}")
    print(f"Выгружено групп: {len(groups)}")
    print(f"Время выполнения: {elapsed:.1f} сек")
    print(f"Сохранено в файл: {output_file}")
